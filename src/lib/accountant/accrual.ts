/**
 * Lazy compounding accrual engine — design: accountant-m1-m3-design.md §4.4.
 *
 * Contract:
 *  - No cron: caller supplies nowMs (injectable for tests).
 *  - Determinism: catch-up once after N intervals ≡ N on-time catch-ups
 *    (byte-identical tick rows — same amounts AND occurred_at timestamps).
 *  - Monthly = 30 days flat (no calendar arithmetic).
 *  - Zero-amount ticks ARE written (anomaly flag / preserves tick_index continuity).
 *  - One db.batch() per catchUpAccruals call (all inserts + bookmark update atomic).
 *  - The unique index on (loan_id, tick_index) enforces idempotency at the DB level;
 *    we guard at the application level too (only generate ticks > last_accrued_tick).
 */

import { logEvent } from "../logger";

// ─── interval constants ────────────────────────────────────────────────────────

/** Fixed-duration seconds per interval label. Monthly = 30 days flat. */
export const INTERVAL_SECONDS = {
  hourly: 3600,
  daily: 86400,
  weekly: 604800,
  monthly: 2592000, // 30 * 86400 — no calendar math, by design (§4.4)
} as const;

// ─── pure math helpers ─────────────────────────────────────────────────────────

interface LoanBase {
  started_at: string;
  interest_interval: string;
}

interface LoanWithBookmark extends LoanBase {
  last_accrued_tick: number;
}

/**
 * How many full intervals have elapsed between started_at and nowMs?
 * Floors the quotient — returns 0 if now <= start.
 */
export function elapsedTicks(loan: LoanBase, nowMs: number): number {
  const startMs = new Date(loan.started_at).getTime();
  const seconds = INTERVAL_SECONDS[loan.interest_interval as keyof typeof INTERVAL_SECONDS];
  if (seconds === undefined) throw new Error(`Unknown interest_interval: ${loan.interest_interval}`);
  const intervalMs = seconds * 1000;
  const elapsed = (nowMs - startMs) / intervalMs;
  return elapsed <= 0 ? 0 : Math.floor(elapsed);
}

/**
 * The deterministic ISO timestamp of tick (last_accrued_tick + 1).
 * Pure — no DB access. Used by callers to display "next interest date".
 */
export function nextTickAt(loan: LoanWithBookmark): string {
  return tickTimestamp(loan.started_at, loan.interest_interval, loan.last_accrued_tick + 1);
}

/**
 * The deterministic ISO timestamp of tick N for this loan.
 * started_at + N * interval (integer seconds arithmetic — guarantees determinism).
 */
function tickTimestamp(started_at: string, interval: string, index: number): string {
  const startMs = new Date(started_at).getTime();
  const seconds = INTERVAL_SECONDS[interval as keyof typeof INTERVAL_SECONDS];
  if (seconds === undefined) throw new Error(`Unknown interest_interval: ${interval}`);
  const intervalMs = seconds * 1000;
  return new Date(startMs + index * intervalMs).toISOString();
}

// ─── catch-up engine ───────────────────────────────────────────────────────────

interface LoanRow {
  id: number;
  interest_rate: number;
  interest_interval: string;
  started_at: string;
  last_accrued_tick: number;
}

/**
 * Advance all open loans for userId to nowMs, inserting accrual_tick entries and
 * updating last_accrued_tick in a single atomic db.batch() per loan group.
 *
 * Compounding flaw fix:
 *   The naive approach (SELECT SUM(amount) WHERE occurred_at <= tickTs per tick)
 *   misses in-batch ticks because they are not yet committed when later ticks
 *   query the DB. Fix: query committed rows once per tick cutoff (respecting
 *   interleaved repayments at their own timestamps), then add a running in-memory
 *   accumulator of tick amounts queued so far in this batch. Each tick's base is:
 *     base_N = committedSumAsOf(ts_N) + Σ(queuedTickAmounts[0..N-1])
 *   The committed sum covers all entries committed before this catch-up call
 *   (principal + any repayments); the accumulator covers ticks 1..N-1 of the
 *   current batch. This preserves interleaved-repayment correctness while
 *   producing byte-identical rows whether we advance one tick at a time or all
 *   at once.
 */
export async function catchUpAccruals(
  db: D1Database,
  userId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  // Only open loans accrue interest.
  const loans = await db
    .prepare(
      `SELECT id, interest_rate, interest_interval,
              started_at, last_accrued_tick
       FROM accountant_loans
       WHERE user_id = ? AND status = 'open'`,
    )
    .bind(userId)
    .all<LoanRow>();

  // Accumulate statements across ALL loans — one db.batch() per catchUpAccruals call.
  const allStmts: D1PreparedStatement[] = [];

  for (const loan of loans.results) {
    const due = elapsedTicks(loan, nowMs);
    const from = loan.last_accrued_tick + 1;

    if (from > due) continue; // nothing to do for this loan

    // Running accumulator: sum of tick amounts queued in this batch so far.
    // Required for correct compounding — see flaw-fix comment above.
    let queuedSum = 0;

    for (let i = from; i <= due; i++) {
      const ts = tickTimestamp(loan.started_at, loan.interest_interval, i);

      // Committed outstanding as of this tick's timestamp.
      // Includes: principal entry + any repayments with occurred_at <= ts.
      // Does NOT yet include the in-batch ticks (they are uncommitted).
      // user_id filter is defense-in-depth: loan_id already scopes to one user,
      // but explicit scoping prevents data bleed if loan_id ever leaks across users.
      const committedRow = await db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS s
           FROM accountant_entries
           WHERE loan_id = ? AND user_id = ? AND occurred_at <= ?`,
        )
        .bind(loan.id, userId, ts)
        .first<{ s: number }>();

      const committedSum = committedRow?.s ?? 0;

      // True outstanding = committed rows + ticks queued in this batch.
      // For tick 1 queuedSum is 0; for tick 2 it includes tick 1's amount, etc.
      const outstanding = committedSum + queuedSum;

      // Amount: the signed outstanding already carries the correct sign (negative
      // for incoming/liability, positive for outgoing/receivable). Applying the
      // interest rate directly preserves that sign — no direction multiplier needed.
      const amount = Math.round(outstanding * (loan.interest_rate / 100));

      // Advance the in-memory accumulator BEFORE next tick computes its base.
      queuedSum += amount;

      allStmts.push(
        db.prepare(
          `INSERT INTO accountant_entries
             (user_id, occurred_at, amount, category, source, loan_id, tick_index, description)
           VALUES (?, ?, ?, 'financial', 'accrual_tick', ?, ?, ?)`,
        ).bind(
          userId,
          ts,
          amount,
          loan.id,
          i,
          `Interest tick #${i}`,
        ),
      );
    }

    // Advance the bookmark for this loan. user_id filter is defense-in-depth.
    allStmts.push(
      db.prepare(
        `UPDATE accountant_loans SET last_accrued_tick = ? WHERE id = ? AND user_id = ?`,
      ).bind(due, loan.id, userId),
    );

    logEvent("accrual.catchUp", {
      loanId: loan.id,
      userId,
      from,
      to: due,
      ticksWritten: due - from + 1,
    });
  }

  // One atomic batch for the entire catch-up call (all loans combined).
  if (allStmts.length > 0) {
    await db.batch(allStmts);
  }
}
