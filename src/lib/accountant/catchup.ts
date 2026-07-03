/**
 * Combined lazy catch-up (design §4): loan accrual + order fine ticks, committed in
 * bounded chunked batches, runs at the top of every accountant read. No cron
 * (staging crons are disabled). No try/catch at call sites — a throw is a 500, never
 * stale numbers.
 *
 * Accrual and fines SHARE one per-call tick budget (MAX_TICKS_PER_CATCHUP): accrual
 * spends first, fines get the remainder, so a loan backlog can't let an order
 * backlog blow past the cap (and vice versa). A large backlog converges over
 * successive reads instead of one oversized batch.
 */

import { collectAccrualWork, runCatchUpWork, MAX_TICKS_PER_CATCHUP } from "./accrual";
import { collectFineWork } from "./fines";
import type { Scope } from "./scope";

export async function catchUp(db: D1Database, scope: Scope, nowMs: number = Date.now()): Promise<void> {
  const accrual = await collectAccrualWork(db, scope, nowMs);
  const fines = await collectFineWork(db, scope, nowMs, MAX_TICKS_PER_CATCHUP - accrual.ticksAdvanced);
  await runCatchUpWork(db, {
    batches: [...accrual.batches, ...fines.batches],
    logs: [...accrual.logs, ...fines.logs],
    ticksAdvanced: accrual.ticksAdvanced + fines.ticksAdvanced,
  });
}
