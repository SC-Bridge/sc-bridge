import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVALS, nextTickAt } from "../../lib/accountant/accrual";
import { catchUp } from "../../lib/accountant/catchup";
import { assertManager, scopeWhere, type Scope } from "../../lib/accountant/scope";
import { isoDatetime, parseIdParam } from "./schemas";

const RepaymentSchema = z
  .object({
    amount: z.number().int().positive().max(9_999_999_999_999),
    occurred_at: isoDatetime,
    notes: z.string().max(2000).optional(),
  })
  .strict();

// No occurred_at by design (§5.6 + Finding 15): the entry posts at server now.
const ForgiveSchema = z
  .object({
    amount: z.number().int().positive().max(9_999_999_999_999),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const UpdateLoanSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    due_at: isoDatetime.nullable().optional(),
  })
  .strict();

const CreateLoanSchema = z
  .object({
    direction: z.enum(["outgoing", "incoming"]),
    counterparty: z.string().min(1).max(100),
    principal: z.number().int().positive().max(9_999_999_999_999),
    interest_rate: z.number().min(0).max(1000),
    interest_interval: z.enum(INTERVALS),
    fee_multiplier: z.number().min(0).max(1000).default(0),
    started_at: isoDatetime,
    due_at: isoDatetime.optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

/** Row shape returned by `SELECT l.*` on accountant_loans. */
interface LoanListRow {
  id: number;
  user_id: string;
  status: string;
  principal: number;
  interest_rate: number;
  interest_interval: string;
  started_at: string;
  last_accrued_tick: number;
  [key: string]: unknown;
}

/**
 * /api/accountant/loans — loan lifecycle (design §4.3). Loans are agreement state;
 * every economic event is a loan_id-linked ledger row. Outstanding is never stored.
 * Catch-up accrual runs at the top of every read (design §4.4) so views are current.
 */
export function loansRoutes() {
  const routes = new Hono<HonoEnv>();

  // ---------------------------------------------------------------------------
  // Private helper: run accruals, fetch loan row (user-scoped), compute outstanding.
  // ---------------------------------------------------------------------------
  async function loadLoan(db: D1Database, scope: Scope, id: number) {
    await catchUp(db, scope);
    const loan = await db
      .prepare(`SELECT * FROM accountant_loans WHERE id = ? AND ${scope.sql}`)
      .bind(id, ...scope.binds)
      .first<LoanListRow>();
    if (!loan) return null;
    // loan_id uniquely scopes its entries — no need to re-filter by user/org.
    const outRow = await db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS bal FROM accountant_entries WHERE loan_id = ?")
      .bind(id)
      .first<{ bal: number }>();
    return { loan, signedOutstanding: outRow?.bal ?? 0 };
  }

  // POST /loans — atomic: loan row + principal entry (± by direction) + fee entry.
  routes.post("/", validate("json", CreateLoanSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const scope = c.get("acctScope")!;
    if (scope.orgId) await assertManager(db, scope.orgId, userID); // corp writes are manager-gated (D3/D13)
    const b = c.req.valid("json");

    // Insert the loan first to get its id, then batch its entries atomically.
    // org_id = scope.orgId (NULL for private); user_id = the acting member (attribution).
    const loanRes = await db
      .prepare(
        `INSERT INTO accountant_loans
           (user_id, org_id, direction, counterparty, principal, interest_rate, interest_interval,
            fee_multiplier, started_at, due_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userID,
        scope.orgId,
        b.direction,
        b.counterparty,
        b.principal,
        b.interest_rate,
        b.interest_interval,
        b.fee_multiplier,
        b.started_at,
        b.due_at ?? null,
        b.notes ?? null,
      )
      .run();
    const loanId = loanRes.meta.last_row_id as number;

    // outgoing = receivable (+), incoming = liability (−). Fee carries principal's sign
    // (it grows the obligation in the same direction).
    const sign = b.direction === "incoming" ? -1 : 1;
    // Fee = principal × (rate/100) × multiplier (owner amendment 2026-06-11, supersedes the
    // master doc's literal rate × multiplier): 100k @ 5%/mo × 1.5 → 7,500 aUEC.
    const fee = Math.round(b.principal * (b.interest_rate / 100) * b.fee_multiplier);

    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO accountant_entries
             (user_id, org_id, occurred_at, amount, category, source, loan_id, description)
           VALUES (?, ?, ?, ?, 'financial', 'loan_principal', ?, ?)`,
        )
        .bind(userID, scope.orgId, b.started_at, sign * b.principal, loanId, `Loan principal · ${b.counterparty}`),
    ];
    if (fee > 0) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO accountant_entries
               (user_id, org_id, occurred_at, amount, category, source, loan_id, description)
             VALUES (?, ?, ?, ?, 'financial', 'loan_fee', ?, ?)`,
          )
          .bind(userID, scope.orgId, b.started_at, sign * fee, loanId, "Loan creation fee"),
      );
    }

    try {
      await db.batch(stmts);
    } catch (err) {
      // Compensate: the loan row was inserted before the batch; remove it so we
      // don't leave an orphan loan with no entries. Then rethrow so the caller
      // sees a 500 rather than a silently broken loan.
      await db
        .prepare("DELETE FROM accountant_loans WHERE id = ? AND user_id = ?")
        .bind(loanId, userID)
        .run();
      throw err;
    }

    return c.json({ ok: true, id: loanId });
  });

  // GET /loans — list with computed outstanding/accrued/nextTickAt (accrual first).
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const scope = c.get("acctScope")!;
    await catchUp(db, scope);

    // loan_id uniquely scopes entries, so the subqueries need no user/org filter.
    const loans = await db
      .prepare(
        `SELECT l.*,
           COALESCE((SELECT SUM(amount) FROM accountant_entries e
                     WHERE e.loan_id = l.id), 0) AS signed_outstanding,
           COALESCE((SELECT SUM(amount) FROM accountant_entries e
                     WHERE e.loan_id = l.id AND e.source = 'accrual_tick'), 0) AS signed_accrued
         FROM accountant_loans l
         WHERE ${scopeWhere(scope, "l")}
         ORDER BY l.status ASC, l.created_at DESC`,
      )
      .bind(...scope.binds)
      .all<LoanListRow & { signed_outstanding: number; signed_accrued: number }>();

    const shaped = loans.results.map((l) => ({
      ...l,
      outstanding: Math.abs(l.signed_outstanding),
      accrued: Math.abs(l.signed_accrued),
      nextTickAt: nextTickAt(l),
    }));
    return c.json({ loans: shaped });
  });

  // GET /loans/:id — detail with repayment history + upcoming-tick preview.
  routes.get("/:id", async (c) => {
    const db = c.env.DB;
    const scope = c.get("acctScope")!;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);

    const loaded = await loadLoan(db, scope, id);
    if (!loaded) return c.json({ error: "Not found" }, 404);
    const { loan } = loaded;

    // loadLoan already verified scope ownership; loan_id uniquely scopes entries.
    const [accRow, feeRow, repayments, forgiveness] = await Promise.all([
      db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE loan_id = ? AND source = 'accrual_tick'")
        .bind(id).first<{ bal: number }>(),
      db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE loan_id = ? AND source = 'loan_fee'")
        .bind(id).first<{ bal: number }>(),
      db.prepare(
        `SELECT id, amount, occurred_at, notes FROM accountant_entries
         WHERE loan_id = ? AND source = 'loan_repayment'
         ORDER BY occurred_at ASC`,
      ).bind(id).all<{ id: number; amount: number; occurred_at: string }>(),
      // Forgiveness entries are a distinct history from repayments (design §5.6):
      // they reduce outstanding without payment, so they belong on the detail
      // view alongside repayments — not just buried in the ledger.
      db.prepare(
        `SELECT id, amount, occurred_at, notes FROM accountant_entries
         WHERE loan_id = ? AND source = 'loan_forgiveness'
         ORDER BY occurred_at ASC, id ASC`,
      ).bind(id).all<{ id: number; amount: number; occurred_at: string; notes: string | null }>(),
    ]);

    const outstanding = Math.abs(loaded.signedOutstanding);
    const projectedAmount = Math.round((outstanding * loan.interest_rate) / 100);

    return c.json({
      loan,
      outstanding,
      accrued: Math.abs(accRow?.bal ?? 0),
      fee: Math.abs(feeRow?.bal ?? 0),
      repayments: repayments.results.map((r) => ({ ...r, amount: Math.abs(r.amount) })),
      forgiveness: forgiveness.results.map((r) => ({ ...r, amount: Math.abs(r.amount) })),
      preview: {
        nextTickAt: nextTickAt(loan),
        projectedAmount,
        paybackTotal: outstanding + projectedAmount,
      },
    });
  });

  // POST /loans/:id/repayments — reduces outstanding; auto-settles at exactly 0.
  routes.post("/:id/repayments", validate("json", RepaymentSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const scope = c.get("acctScope")!;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    if (scope.orgId) await assertManager(db, scope.orgId, userID);
    const { amount, occurred_at, notes } = c.req.valid("json");

    const loaded = await loadLoan(db, scope, id);
    if (!loaded) return c.json({ error: "Not found" }, 404);
    if (loaded.loan.status === "settled") {
      return c.json({ error: "Loan already settled" }, 400);
    }
    const outstanding = Math.abs(loaded.signedOutstanding);
    if (amount > outstanding) {
      // Design §6: echo current outstanding for inline UI display.
      return c.json({ error: "Repayment exceeds outstanding", outstanding }, 400);
    }

    // Repayment carries the OPPOSITE sign of the obligation (reduces it).
    const sign = loaded.signedOutstanding < 0 ? 1 : -1;
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO accountant_entries
             (user_id, org_id, occurred_at, amount, category, source, loan_id, notes, description)
           VALUES (?, ?, ?, ?, 'financial', 'loan_repayment', ?, ?, 'Loan repayment')`,
        )
        .bind(userID, scope.orgId, occurred_at, sign * amount, id, notes ?? null),
    ];
    const settled = amount === outstanding;
    if (settled) {
      stmts.push(
        db.prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ?").bind(id),
      );
    }
    await db.batch(stmts);
    return c.json({ ok: true, settled, outstanding: outstanding - amount });
  });

  // POST /loans/:id/forgive — partial forgiveness without payment (M2 amendment, design §5.6).
  // Sign is OPPOSITE the signed outstanding: outstanding math gains the term and shrinks
  // toward zero — outstanding = principal + fee + Σticks − Σrepayments ∓ Σforgiveness.
  // Real P&L (no report exclusion): debt relief (+) / eaten loss (−). Auto-settles at exactly 0.
  routes.post("/:id/forgive", validate("json", ForgiveSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const scope = c.get("acctScope")!;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    if (scope.orgId) await assertManager(db, scope.orgId, userID);
    const { amount, notes } = c.req.valid("json");

    const loaded = await loadLoan(db, scope, id);
    if (!loaded) return c.json({ error: "Not found" }, 404);
    if (loaded.loan.status === "settled") {
      return c.json({ error: "Loan already settled" }, 400);
    }
    const outstanding = Math.abs(loaded.signedOutstanding);
    if (amount > outstanding) {
      // Design §6: echo current outstanding for inline UI display.
      return c.json({ error: "Forgiveness exceeds outstanding", outstanding }, 400);
    }

    // Forgiveness carries the OPPOSITE sign of the obligation (same rule as repayments).
    const sign = loaded.signedOutstanding < 0 ? 1 : -1;
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO accountant_entries
             (user_id, org_id, occurred_at, amount, category, source, loan_id, notes, description)
           VALUES (?, ?, ?, ?, 'financial', 'loan_forgiveness', ?, ?, 'Loan forgiveness')`,
        )
        .bind(userID, scope.orgId, new Date().toISOString(), sign * amount, id, notes ?? null),
    ];
    const settled = amount === outstanding;
    if (settled) {
      stmts.push(
        db.prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ?").bind(id),
      );
    }
    await db.batch(stmts);
    return c.json({ ok: true, settled, outstanding: outstanding - amount });
  });

  // POST /loans/:id/settle — manual close; remainder is an explicit write-off (no entry).
  routes.post("/:id/settle", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const scope = c.get("acctScope")!;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    if (scope.orgId) await assertManager(db, scope.orgId, userID);
    const loaded = await loadLoan(db, scope, id);
    if (!loaded) return c.json({ error: "Not found" }, 404);

    if (loaded.loan.status === "settled") {
      return c.json({ error: "Loan already settled" }, 400);
    }

    await db
      .prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ?")
      .bind(id)
      .run();
    return c.json({ ok: true, writeOff: Math.abs(loaded.signedOutstanding) });
  });

  // PUT /loans/:id — notes + due_at only (financial terms locked at creation).
  routes.put("/:id", validate("json", UpdateLoanSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const scope = c.get("acctScope")!;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    if (scope.orgId) await assertManager(db, scope.orgId, userID);
    const body = c.req.valid("json");

    const exists = await db
      .prepare(`SELECT id FROM accountant_loans WHERE id = ? AND ${scope.sql}`)
      .bind(id, ...scope.binds)
      .first<{ id: number }>();
    if (!exists) return c.json({ error: "Not found" }, 404);

    const sets: string[] = [];
    const binds: (string | null)[] = [];
    for (const key of ["notes", "due_at"] as const) {
      if (body[key] !== undefined) { sets.push(`${key} = ?`); binds.push(body[key] ?? null); }
    }
    if (sets.length === 0) return c.json({ ok: true });
    binds.push(String(id));
    await db
      .prepare(`UPDATE accountant_loans SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
