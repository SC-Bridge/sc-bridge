import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVAL_SECONDS, catchUpAccruals, nextTickAt } from "../../lib/accountant/accrual";
import { parseIdParam } from "./schemas";

const RepaymentSchema = z
  .object({
    amount: z.number().int().positive().max(9_999_999_999_999),
    occurred_at: z.string().datetime({ offset: true }).max(50),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const UpdateLoanSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    due_at: z.string().datetime({ offset: true }).max(50).nullable().optional(),
  })
  .strict();

const CreateLoanSchema = z
  .object({
    direction: z.enum(["outgoing", "incoming"]),
    counterparty: z.string().min(1).max(100),
    principal: z.number().int().positive().max(9_999_999_999_999),
    interest_rate: z.number().min(0).max(1000),
    interest_interval: z.enum(["hourly", "daily", "weekly", "monthly"]),
    fee_multiplier: z.number().min(0).max(1000).default(0),
    started_at: z.string().datetime({ offset: true }).max(50),
    due_at: z.string().datetime({ offset: true }).max(50).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

// Verify the enum keys stay in sync with INTERVAL_SECONDS at import time.
// This is a compile-time + runtime guard: if accrual.ts ever adds/removes an
// interval label the type system (and the assertion below) will catch it.
const _: Record<"hourly" | "daily" | "weekly" | "monthly", number> = INTERVAL_SECONDS as never;
void _;

/**
 * /api/accountant/loans — loan lifecycle (design §4.3). Loans are agreement state;
 * every economic event is a loan_id-linked ledger row. Outstanding is never stored.
 * Catch-up accrual runs at the top of every read (design §4.4) so views are current.
 */
export function loansRoutes() {
  const routes = new Hono<HonoEnv>();

  // POST /loans — atomic: loan row + principal entry (± by direction) + fee entry.
  routes.post("/", validate("json", CreateLoanSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const b = c.req.valid("json");

    // Insert the loan first to get its id, then batch its entries atomically.
    const loanRes = await db
      .prepare(
        `INSERT INTO accountant_loans
           (user_id, direction, counterparty, principal, interest_rate, interest_interval,
            fee_multiplier, started_at, due_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userID,
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
             (user_id, occurred_at, amount, category, source, loan_id, description)
           VALUES (?, ?, ?, 'financial', 'loan_principal', ?, ?)`,
        )
        .bind(userID, b.started_at, sign * b.principal, loanId, `Loan principal · ${b.counterparty}`),
    ];
    if (fee > 0) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO accountant_entries
               (user_id, occurred_at, amount, category, source, loan_id, description)
             VALUES (?, ?, ?, 'financial', 'loan_fee', ?, ?)`,
          )
          .bind(userID, b.started_at, sign * fee, loanId, "Loan creation fee"),
      );
    }
    await db.batch(stmts);

    return c.json({ ok: true, id: loanId });
  });

  // GET /loans — list with computed outstanding/accrued/nextTickAt (accrual first).
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUpAccruals(db, userID);

    const loans = await db
      .prepare(
        `SELECT l.*,
           COALESCE((SELECT SUM(amount) FROM accountant_entries e
                     WHERE e.loan_id = l.id AND e.user_id = l.user_id), 0) AS signed_outstanding,
           COALESCE((SELECT SUM(amount) FROM accountant_entries e
                     WHERE e.loan_id = l.id AND e.user_id = l.user_id AND e.source = 'accrual_tick'), 0) AS signed_accrued
         FROM accountant_loans l
         WHERE l.user_id = ?
         ORDER BY l.status ASC, l.created_at DESC`,
      )
      .bind(userID)
      .all<Record<string, unknown> & { signed_outstanding: number; signed_accrued: number }>();

    const shaped = loans.results.map((l) => ({
      ...l,
      outstanding: Math.abs(l.signed_outstanding),
      accrued: Math.abs(l.signed_accrued),
      nextTickAt: nextTickAt(l as never),
    }));
    return c.json({ loans: shaped });
  });

  // GET /loans/:id — detail with repayment history + upcoming-tick preview.
  routes.get("/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    await catchUpAccruals(db, userID);

    const loan = await db
      .prepare("SELECT * FROM accountant_loans WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{
        id: number; principal: number; interest_rate: number;
        interest_interval: string; started_at: string; last_accrued_tick: number;
      }>();
    if (!loan) return c.json({ error: "Not found" }, 404);

    const [outRow, accRow, feeRow, repayments] = await Promise.all([
      db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE loan_id = ? AND user_id = ?")
        .bind(id, userID).first<{ bal: number }>(),
      db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE loan_id = ? AND user_id = ? AND source = 'accrual_tick'")
        .bind(id, userID).first<{ bal: number }>(),
      db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE loan_id = ? AND user_id = ? AND source = 'loan_fee'")
        .bind(id, userID).first<{ bal: number }>(),
      db.prepare(
        `SELECT id, amount, occurred_at, notes FROM accountant_entries
         WHERE loan_id = ? AND user_id = ? AND source = 'loan_repayment'
         ORDER BY occurred_at ASC`,
      ).bind(id, userID).all<{ id: number; amount: number; occurred_at: string }>(),
    ]);

    const outstanding = Math.abs(outRow?.bal ?? 0);
    const projectedAmount = Math.round((outstanding * loan.interest_rate) / 100);

    return c.json({
      loan,
      outstanding,
      accrued: Math.abs(accRow?.bal ?? 0),
      fee: Math.abs(feeRow?.bal ?? 0),
      repayments: repayments.results.map((r) => ({ ...r, amount: Math.abs(r.amount) })),
      preview: {
        nextTickAt: nextTickAt(loan),
        projectedAmount,
        paybackTotal: outstanding + projectedAmount,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Private helper: run accruals, fetch loan row (user-scoped), compute outstanding.
  // ---------------------------------------------------------------------------
  async function loadLoan(db: D1Database, userID: string, id: number) {
    await catchUpAccruals(db, userID);
    const loan = await db
      .prepare("SELECT * FROM accountant_loans WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ id: number; status: string; user_id: string }>();
    if (!loan) return null;
    const outRow = await db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS bal FROM accountant_entries WHERE loan_id = ? AND user_id = ?",
      )
      .bind(id, userID)
      .first<{ bal: number }>();
    return { loan, signedOutstanding: outRow?.bal ?? 0 };
  }

  // POST /loans/:id/repayments — reduces outstanding; auto-settles at exactly 0.
  routes.post("/:id/repayments", validate("json", RepaymentSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const { amount, occurred_at, notes } = c.req.valid("json");

    const loaded = await loadLoan(db, userID, id);
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
             (user_id, occurred_at, amount, category, source, loan_id, notes, description)
           VALUES (?, ?, ?, 'financial', 'loan_repayment', ?, ?, 'Loan repayment')`,
        )
        .bind(userID, occurred_at, sign * amount, id, notes ?? null),
    ];
    const settled = amount === outstanding;
    if (settled) {
      stmts.push(
        db.prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ? AND user_id = ?").bind(id, userID),
      );
    }
    await db.batch(stmts);
    return c.json({ ok: true, settled, outstanding: outstanding - amount });
  });

  // POST /loans/:id/settle — manual close; remainder is an explicit write-off (no entry).
  routes.post("/:id/settle", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const loaded = await loadLoan(db, userID, id);
    if (!loaded) return c.json({ error: "Not found" }, 404);

    await db
      .prepare("UPDATE accountant_loans SET status = 'settled' WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .run();
    return c.json({ ok: true, writeOff: Math.abs(loaded.signedOutstanding) });
  });

  // PUT /loans/:id — notes + due_at only (financial terms locked at creation).
  routes.put("/:id", validate("json", UpdateLoanSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");

    const exists = await db
      .prepare("SELECT id FROM accountant_loans WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ id: number }>();
    if (!exists) return c.json({ error: "Not found" }, 404);

    const sets: string[] = [];
    const binds: (string | null)[] = [];
    for (const key of ["notes", "due_at"] as const) {
      if (body[key] !== undefined) { sets.push(`${key} = ?`); binds.push(body[key] ?? null); }
    }
    if (sets.length === 0) return c.json({ ok: true });
    binds.push(String(id), userID);
    await db
      .prepare(`UPDATE accountant_loans SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
      .bind(...binds)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
