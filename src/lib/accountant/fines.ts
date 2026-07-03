/**
 * Late-delivery fine engine (design §5.2) — the order-side analog of accrual.ts.
 *
 * Contract: lazy, deterministic, idempotent, NEVER compounding — a tick's base is
 * (quantity − fulfilled qty as of that tick's deterministic timestamp) × price_per_unit;
 * prior fines never enter the base, structurally, in both rate modes.
 * Direction: purchase (counterparty owes delivery) → income (+); sale → expense (−).
 * Zero-amount ticks are NOT written — a flat rate or percent remainder that rounds to
 * 0 is ledger noise; the INSERT is skipped but the bookmark still advances over the
 * index (tick_index may gap; nothing relies on continuity). Mirrors accrual.ts.
 * Bounded, chunked, resumable: at most `maxTicks` indexes advance per call, committed
 * in BATCH_CHUNK-sized batches whose bookmark advance rides with the ticks it covers,
 * so a backlog converges over reads and a crash between chunks simply resumes.
 * Tick INSERTs are INSERT OR IGNORE: the bookmark last_fine_day + the unique
 * (order_id, tick_index) index already make double-posting impossible on a single
 * path; OR IGNORE additionally lets two CONCURRENT reads that cross the same tick
 * boundary both succeed — determinism guarantees the colliding rows are byte-identical,
 * so the loser's write is a safe no-op instead of a unique-constraint 500.
 */

import { INTERVAL_SECONDS, BATCH_CHUNK, MAX_TICKS_PER_CATCHUP } from "./accrual";
import type { CatchUpLog, CatchUpWork } from "./accrual";
import type { Scope } from "./scope";

// ─── pure math helpers ─────────────────────────────────────────────────────────

/**
 * The deterministic ISO timestamp of fine tick N for an order.
 * deliver_by + N * interval (integer seconds arithmetic — guarantees determinism;
 * the accrual.ts tickTimestamp math).
 */
export function fineTickTimestamp(deliver_by: string, interval: string, index: number): string {
  const startMs = new Date(deliver_by).getTime();
  const seconds = INTERVAL_SECONDS[interval as keyof typeof INTERVAL_SECONDS];
  if (seconds === undefined) throw new Error(`Unknown fine_interval: ${interval}`);
  return new Date(startMs + index * seconds * 1000).toISOString();
}

/**
 * How many full fine intervals have elapsed between deliver_by and nowMs?
 * Floors the quotient — returns 0 if now <= deliver_by.
 */
export function elapsedFineTicks(
  o: { deliver_by: string; fine_interval: string },
  nowMs: number,
): number {
  const startMs = new Date(o.deliver_by).getTime();
  const seconds = INTERVAL_SECONDS[o.fine_interval as keyof typeof INTERVAL_SECONDS];
  if (seconds === undefined) throw new Error(`Unknown fine_interval: ${o.fine_interval}`);
  const elapsed = (nowMs - startMs) / (seconds * 1000);
  return elapsed <= 0 ? 0 : Math.floor(elapsed);
}

// ─── catch-up work collector ───────────────────────────────────────────────────

interface FineOrderRow {
  id: number;
  user_id: string;
  org_id: string | null;
  type: string;
  quantity: number;
  price_per_unit: number;
  deliver_by: string;
  fine_interval: string;
  fine_rate_type: string;
  fine_rate: number;
  last_fine_day: number;
}

/**
 * Collect the statements that advance all fine-eligible orders for userId to
 * nowMs (contract_fine inserts + last_fine_day bookmark updates) WITHOUT
 * batching them — the combined catchUp() owns the batch.
 *
 * Eligibility (design §5.2): status open/in_progress, deliver_by set,
 * fine_rate > 0. Percent base is the unfulfilled remainder AS OF each tick's
 * deterministic timestamp — fulfilments between ticks shrink later ticks.
 */
export async function collectFineWork(
  db: D1Database,
  scope: Scope,
  nowMs: number,
  maxTicks: number = MAX_TICKS_PER_CATCHUP,
): Promise<CatchUpWork> {
  const orders = await db
    .prepare(
      `SELECT id, user_id, org_id, type, quantity, price_per_unit, deliver_by, fine_interval, fine_rate_type, fine_rate, last_fine_day
       FROM accountant_orders
       WHERE ${scope.sql} AND status IN ('open', 'in_progress')
         AND deliver_by IS NOT NULL AND fine_rate > 0`,
    )
    .bind(...scope.binds)
    .all<FineOrderRow>();

  // Ordered atomic units (see CatchUpWork): each commits with one db.batch().
  const batches: D1PreparedStatement[][] = [];
  const logs: CatchUpLog[] = [];
  // Per-call budget of tick indexes, shared across every order in this scope (and,
  // via catchUp(), with loan accrual — fines get what accrual leaves).
  let budget = maxTicks;
  let ticksAdvanced = 0;

  for (const o of orders.results) {
    if (budget <= 0) break; // cap reached — remaining orders converge on later reads

    const due = elapsedFineTicks(o, nowMs);
    const from = o.last_fine_day + 1;
    if (from > due) continue; // nothing to do for this order

    // Cap this order's advance to the remaining budget; the next read resumes at
    // cappedDue + 1. Fines never compound, so a resumed run is trivially identical.
    const cappedDue = Math.min(due, from + budget - 1);

    // ONE fulfilment query per order regardless of tick count (accrual.ts lesson).
    // order_id alone scopes to one ledger (an order belongs to exactly one scope).
    const fulfilments = await db
      .prepare(
        `SELECT quantity, occurred_at FROM accountant_entries
         WHERE order_id = ? AND source = 'order_fulfillment'`,
      )
      .bind(o.id)
      .all<{ quantity: number; occurred_at: string }>();

    // Chunking state: buffer INSERTs; each flush appends the bookmark UPDATE that
    // covers them and closes an atomic batch. `lastFlushed` lets us skip a redundant
    // final batch when the last chunk landed exactly on cappedDue.
    let chunk: D1PreparedStatement[] = [];
    let inserts = 0;
    let lastFlushed = from - 1;
    const bookmarkStmt = (index: number) =>
      db.prepare("UPDATE accountant_orders SET last_fine_day = ? WHERE id = ?").bind(index, o.id);
    const flush = (index: number) => {
      chunk.push(bookmarkStmt(index));
      batches.push(chunk);
      chunk = [];
      lastFlushed = index;
    };

    for (let i = from; i <= cappedDue; i++) {
      const ts = fineTickTimestamp(o.deliver_by, o.fine_interval, i);
      const tsMs = new Date(ts).getTime();
      let mag: number;
      if (o.fine_rate_type === "flat") {
        mag = Math.round(o.fine_rate);
      } else {
        // Epoch-ms comparison — string compare across .000Z / no-millis ISO
        // formats is unreliable (the accrual.ts lesson).
        let fulfilled = 0;
        for (const f of fulfilments.results) {
          if (new Date(f.occurred_at).getTime() <= tsMs) fulfilled += f.quantity ?? 0;
        }
        const remainingValue = Math.max(0, o.quantity - fulfilled) * o.price_per_unit;
        mag = Math.round((remainingValue * o.fine_rate) / 100);
      }

      // Zero-amount ticks are ledger noise: skip the INSERT but let the bookmark
      // advance over the index (below). Mirrors accrual.ts; determinism holds.
      if (mag === 0) continue;

      // Purchase: the counterparty owes YOU delivery — their lateness is your income.
      const amount = o.type === "purchase" ? mag : -mag;
      // Fine rows carry the order's OWN scope (attribution + ledger), not the caller's.
      // INSERT OR IGNORE — see the concurrency note in this file's header.
      chunk.push(
        db.prepare(
          `INSERT OR IGNORE INTO accountant_entries
             (user_id, org_id, occurred_at, amount, category, source, order_id, tick_index, description)
           VALUES (?, ?, ?, ?, 'financial', 'contract_fine', ?, ?, ?)`,
        ).bind(o.user_id, o.org_id, ts, amount, o.id, i, `Late fine tick #${i}`),
      );
      inserts++;

      // Leave one slot for the bookmark UPDATE that rides with this chunk.
      if (chunk.length >= BATCH_CHUNK - 1) flush(i);
    }

    // Final bookmark to cappedDue — covers trailing zero-skips and the all-zero case.
    if (chunk.length > 0 || lastFlushed < cappedDue) flush(cappedDue);

    budget -= cappedDue - from + 1;
    ticksAdvanced += cappedDue - from + 1;

    logs.push({
      event: "accountant_fine_catchup",
      payload: { orderId: o.id, userId: o.user_id, orgId: o.org_id, from, to: cappedDue, ticksWritten: inserts, capped: cappedDue < due },
    });
  }

  return { batches, logs, ticksAdvanced };
}
