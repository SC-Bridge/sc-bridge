/**
 * Lazy compounding accrual engine — design: accountant-m1-m3-design.md §4.4.
 *
 * Contract:
 *  - No cron: caller supplies nowMs (injectable for tests).
 *  - Determinism: catch-up once after N intervals ≡ N on-time catch-ups
 *    (byte-identical tick rows — same amounts AND occurred_at timestamps).
 *  - Monthly = 30 days flat (no calendar arithmetic).
 *  - Zero-amount ticks are NOT written — round(outstanding × rate) = 0 is ledger
 *    noise. The INSERT is skipped but the bookmark still advances over the tick, so
 *    tick_index may have gaps (nothing relies on continuity; the bookmark is a
 *    high-water mark, not a count). Determinism is unaffected: a skipped zero row is
 *    byte-identical to a skipped zero row on replay.
 *  - Bounded, chunked, resumable writes (see collectAccrualWork): at most
 *    MAX_TICKS_PER_CATCHUP indexes advance per call, committed in BATCH_CHUNK-sized
 *    batches whose bookmark advance rides with the ticks it covers. A large backlog
 *    converges over successive reads instead of one oversized batch — reads never
 *    throw because the backlog is large.
 *  - Tick INSERTs are INSERT OR IGNORE: the unique index on (loan_id, tick_index)
 *    plus determinism (colliding rows are byte-identical) make a concurrent double
 *    catch-up a clean no-op instead of a 500. We also guard at the application level
 *    (only generate ticks > last_accrued_tick).
 */

import { logEvent } from "../logger";
import { privateScope, type Scope } from "./scope";

// ─── interval constants ────────────────────────────────────────────────────────

/** Canonical ordered list of interval labels. Single source of truth for Zod enums. */
export const INTERVALS = ["hourly", "daily", "weekly", "monthly"] as const;

/** Fixed-duration seconds per interval label. Monthly = 30 days flat. */
export const INTERVAL_SECONDS: Record<(typeof INTERVALS)[number], number> = {
  hourly: 3600,
  daily: 86400,
  weekly: 604800,
  monthly: 2592000, // 30 * 86400 — no calendar math, by design (§4.4)
};

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
  user_id: string;
  org_id: string | null;
  interest_rate: number;
  interest_interval: string;
  started_at: string;
  last_accrued_tick: number;
}

/**
 * Per-call ceiling on the number of tick indexes a single catch-up advances
 * (accrual + fines SHARE this budget — see catchUp() in catchup.ts). A loan
 * backdated years with an hourly interval owes tens of thousands of ticks; writing
 * them all at once risks an oversized D1 batch and a self-DoS on a plain read. We
 * advance at most this many indexes per call and let the remainder converge on
 * subsequent reads — the bookmark resumes exactly where we stopped. Convergence:
 * each read closes ≤ MAX_TICKS_PER_CATCHUP of the gap, so after ⌈backlog / cap⌉
 * reads the ledger holds the exact deterministic total. 1000 ≈ 10 batches of 100.
 */
export const MAX_TICKS_PER_CATCHUP = 1000;

/**
 * Max statements per db.batch() — the codebase's D1 chunking convention
 * (companion.ts, ingest.ts). Each committed chunk carries at most BATCH_CHUNK-1
 * tick INSERTs plus the one bookmark UPDATE that covers them.
 */
export const BATCH_CHUNK = 100;

/** A telemetry entry emitted only after the work commits (no phantom events). */
export type CatchUpLog = { event: string; payload: Record<string, unknown> };

/**
 * Prepared-but-unexecuted catch-up output. `batches` is an ordered list of atomic
 * units: each is committed with ONE db.batch(), in order. Within a loan/order a
 * chunk's tick INSERTs and the bookmark advance covering them share a batch, so a
 * crash between chunks can never leave the bookmark ahead of materialized ticks —
 * the next read simply resumes (ticks are append-only + INSERT OR IGNORE). The
 * combined catchUp() concatenates accrual + fine batches; logs are emitted only
 * after every batch commits. `ticksAdvanced` is the count of tick indexes consumed
 * (zero-amount skips included) so the caller can share one cap across both engines.
 */
export interface CatchUpWork {
  batches: D1PreparedStatement[][];
  logs: CatchUpLog[];
  ticksAdvanced: number;
}

/**
 * Execute prepared catch-up work: commit each batch in order, then (and only then)
 * emit telemetry. Batches are ordered so tick INSERTs always commit before or with
 * the bookmark that covers them; a mid-way throw leaves a resumable state and no
 * phantom logs. Callers must NOT wrap this in try/catch — a throw is a 500, never
 * silently stale numbers (design §4).
 */
export async function runCatchUpWork(db: D1Database, work: CatchUpWork): Promise<void> {
  for (const batch of work.batches) {
    await db.batch(batch);
  }
  for (const l of work.logs) logEvent(l.event, l.payload);
}

/**
 * Collect the statements that advance all open loans for userId to nowMs
 * (accrual_tick inserts + last_accrued_tick bookmark updates) WITHOUT batching
 * them — the caller owns the batch.
 *
 * Compounding flaw fix:
 *   The naive approach (SELECT SUM(amount) WHERE occurred_at <= tickTs per tick)
 *   misses in-batch ticks because they are not yet committed when later ticks
 *   query the DB. Fix: fetch all committed entries for the loan ONCE, then for
 *   each tick compute the cutoff sum in memory (entries with occurred_at epoch <=
 *   tick timestamp epoch), plus a running accumulator of tick amounts queued so far.
 *   Each tick's base is:
 *     base_N = committedSumAsOf(ts_N) + Σ(queuedTickAmounts[0..N-1])
 *   The committed sum covers all entries committed before this catch-up call
 *   (principal + any repayments); the accumulator covers ticks 1..N-1 of the
 *   current batch. This preserves interleaved-repayment correctness while
 *   producing byte-identical rows whether we advance one tick at a time or all
 *   at once. One query per loan regardless of tick count.
 *
 *   Timestamp comparison uses epoch ms (new Date(s).getTime()) rather than string
 *   comparison because seeds use "2026-06-02T06:00:00Z" (no millis) while entries
 *   written by the engine use new Date().toISOString() (with .000Z millis). String
 *   comparison across these formats is not reliable.
 */
export async function collectAccrualWork(
  db: D1Database,
  scope: Scope,
  nowMs: number,
  maxTicks: number = MAX_TICKS_PER_CATCHUP,
): Promise<CatchUpWork> {
  // Only open loans accrue interest, scoped to the active ledger (private or corp).
  const loans = await db
    .prepare(
      `SELECT id, user_id, org_id, interest_rate, interest_interval,
              started_at, last_accrued_tick
       FROM accountant_loans
       WHERE ${scope.sql} AND status = 'open'`,
    )
    .bind(...scope.binds)
    .all<LoanRow>();

  // Ordered atomic units (see CatchUpWork): each commits with one db.batch().
  const batches: D1PreparedStatement[][] = [];
  // Accumulate log payloads; the caller emits them only after all batches succeed.
  const logs: CatchUpLog[] = [];
  // Per-call budget of tick indexes, shared across every loan in this scope.
  let budget = maxTicks;
  let ticksAdvanced = 0;

  for (const loan of loans.results) {
    if (budget <= 0) break; // cap reached — remaining loans converge on later reads

    const due = elapsedTicks(loan, nowMs);
    const from = loan.last_accrued_tick + 1;
    if (from > due) continue; // nothing to do for this loan

    // Cap this loan's advance to the remaining budget. The bookmark stops at
    // cappedDue and the next read resumes at cappedDue + 1 (already-committed ticks
    // re-enter each tick's base via the committed-entries fetch below, so a resumed
    // run is byte-identical to an uninterrupted one).
    const cappedDue = Math.min(due, from + budget - 1);

    // Fetch ALL committed entries for this loan once (principal + repayments +
    // any accrual ticks committed by earlier reads). Avoids N sequential queries.
    // loan_id alone scopes to one ledger (a loan belongs to exactly one scope).
    const committedEntries = await db
      .prepare(
        `SELECT amount, occurred_at FROM accountant_entries WHERE loan_id = ?`,
      )
      .bind(loan.id)
      .all<{ amount: number; occurred_at: string }>();

    // Running accumulator: sum of tick amounts queued in this call so far.
    // Required for correct compounding — see flaw-fix comment above.
    let queuedSum = 0;

    // Chunking state: buffer INSERTs; each flush appends the bookmark UPDATE that
    // covers them and closes an atomic batch. `lastFlushed` tracks the highest tick
    // index a committed bookmark already covers, so we can skip a redundant final
    // batch when the last chunk landed exactly on cappedDue.
    let chunk: D1PreparedStatement[] = [];
    let inserts = 0;
    let lastFlushed = from - 1;
    const bookmarkStmt = (index: number) =>
      db.prepare(`UPDATE accountant_loans SET last_accrued_tick = ? WHERE id = ?`).bind(index, loan.id);
    const flush = (index: number) => {
      chunk.push(bookmarkStmt(index));
      batches.push(chunk);
      chunk = [];
      lastFlushed = index;
    };

    for (let i = from; i <= cappedDue; i++) {
      const ts = tickTimestamp(loan.started_at, loan.interest_interval, i);
      const tsMs = new Date(ts).getTime();

      // Committed outstanding as of this tick's timestamp.
      // Includes: principal + repayments + prior committed ticks with occurred_at <= tsMs.
      // Does NOT include ticks queued but not yet committed in THIS call (queuedSum does).
      // Use epoch ms comparison — string comparison is unreliable across ISO formats
      // that differ in millisecond precision (.000Z vs no-millis Z).
      let committedSum = 0;
      for (const entry of committedEntries.results) {
        if (new Date(entry.occurred_at).getTime() <= tsMs) {
          committedSum += entry.amount;
        }
      }

      // True outstanding = committed rows + ticks queued in this call.
      // For tick 1 queuedSum is 0; for tick 2 it includes tick 1's amount, etc.
      const outstanding = committedSum + queuedSum;

      // Amount: the signed outstanding already carries the correct sign (negative
      // for incoming/liability, positive for outgoing/receivable). Applying the
      // interest rate directly preserves that sign — no direction multiplier needed.
      const amount = Math.round(outstanding * (loan.interest_rate / 100));

      // Advance the in-memory accumulator BEFORE the next tick computes its base —
      // unconditionally, even for a skipped zero, so compounding stays exact.
      queuedSum += amount;

      // Zero-amount ticks are ledger noise: skip the INSERT but let the bookmark
      // advance over the index (below). Determinism holds — a skipped zero replays
      // as a skipped zero.
      if (amount === 0) continue;

      // Tick rows carry the loan's OWN scope (user_id for attribution, org_id for
      // the ledger) — not the triggering caller's — so corp catch-up triggered by
      // any member stamps the corp ledger correctly. INSERT OR IGNORE: a concurrent
      // catch-up crossing the same boundary posts byte-identical rows; the unique
      // (loan_id, tick_index) index turns the loser's write into a no-op, not a 500.
      chunk.push(
        db.prepare(
          `INSERT OR IGNORE INTO accountant_entries
             (user_id, org_id, occurred_at, amount, category, source, loan_id, tick_index, description)
           VALUES (?, ?, ?, ?, 'financial', 'accrual_tick', ?, ?, ?)`,
        ).bind(
          loan.user_id,
          loan.org_id,
          ts,
          amount,
          loan.id,
          i,
          `Interest tick #${i}`,
        ),
      );
      inserts++;

      // Leave one slot for the bookmark UPDATE that rides with this chunk.
      if (chunk.length >= BATCH_CHUNK - 1) flush(i);
    }

    // Final bookmark to cappedDue — covers trailing zero-skips and the all-zero
    // case. Skip only when the last chunk already committed a bookmark AT cappedDue.
    if (chunk.length > 0 || lastFlushed < cappedDue) flush(cappedDue);

    budget -= cappedDue - from + 1;
    ticksAdvanced += cappedDue - from + 1;

    logs.push({
      event: "accrual.catchUp",
      payload: {
        loanId: loan.id, userId: loan.user_id, orgId: loan.org_id,
        from, to: cappedDue, ticksWritten: inserts, capped: cappedDue < due,
      },
    });
  }

  return { batches, logs, ticksAdvanced };
}

/**
 * Loan-only catch-up — collects + batches its own work. Kept with its original
 * signature for the accrual test suite and direct engine callers; route handlers
 * use the combined catchUp() in catchup.ts instead.
 */
export async function catchUpAccruals(
  db: D1Database,
  userId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const work = await collectAccrualWork(db, privateScope(userId), nowMs);
  await runCatchUpWork(db, work);
}
