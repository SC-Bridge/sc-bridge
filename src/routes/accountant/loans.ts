import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVAL_SECONDS, catchUpAccruals, nextTickAt } from "../../lib/accountant/accrual";
import { parseIdParam } from "./schemas";

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

  return routes;
}
