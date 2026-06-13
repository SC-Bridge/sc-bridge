/**
 * Combined lazy catch-up (design §4): loan accrual + order fine ticks, ONE D1
 * batch, runs at the top of every accountant read. No cron (staging crons are
 * disabled). No try/catch at call sites — a throw is a 500, never stale numbers.
 */

import { collectAccrualWork } from "./accrual";
import { collectFineWork } from "./fines";
import { logEvent } from "../logger";
import type { Scope } from "./scope";

export async function catchUp(db: D1Database, scope: Scope, nowMs: number = Date.now()): Promise<void> {
  const accrual = await collectAccrualWork(db, scope, nowMs);
  const fines = await collectFineWork(db, scope, nowMs);
  const stmts = [...accrual.stmts, ...fines.stmts];
  if (stmts.length === 0) return;
  await db.batch(stmts); // one atomic batch — emit logs only after commit
  for (const l of [...accrual.logs, ...fines.logs]) logEvent(l.event, l.payload);
}
