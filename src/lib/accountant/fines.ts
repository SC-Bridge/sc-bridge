/**
 * Late-delivery fine engine (design §5.2) — the order-side analog of accrual.ts.
 *
 * Contract: lazy, deterministic, idempotent, NEVER compounding — a tick's base is
 * (quantity − fulfilled qty as of that tick's deterministic timestamp) × price_per_unit;
 * prior fines never enter the base, structurally, in both rate modes.
 * Direction: purchase (counterparty owes delivery) → income (+); sale → expense (−).
 * Zero-amount ticks ARE written (gapless tick_index sequence — M2 doctrine).
 * Bookmark last_fine_day + the unique (order_id, tick_index) index make
 * double-posting structurally impossible. Plain INSERT (not OR IGNORE) —
 * re-posts fail loudly.
 */

import { INTERVAL_SECONDS } from "./accrual";
import type { CatchUpWork } from "./accrual";

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
  userId: string,
  nowMs: number,
): Promise<CatchUpWork> {
  const orders = await db
    .prepare(
      `SELECT id, type, quantity, price_per_unit, deliver_by, fine_interval, fine_rate_type, fine_rate, last_fine_day
       FROM accountant_orders
       WHERE user_id = ? AND status IN ('open', 'in_progress')
         AND deliver_by IS NOT NULL AND fine_rate > 0`,
    )
    .bind(userId)
    .all<FineOrderRow>();

  const stmts: D1PreparedStatement[] = [];
  const logs: CatchUpWork["logs"] = [];

  for (const o of orders.results) {
    const due = elapsedFineTicks(o, nowMs);
    const from = o.last_fine_day + 1;
    if (from > due) continue; // nothing to do for this order

    // ONE fulfilment query per order regardless of tick count (accrual.ts lesson).
    // user_id filter is defense-in-depth: order_id already scopes to one user.
    const fulfilments = await db
      .prepare(
        `SELECT quantity, occurred_at FROM accountant_entries
         WHERE order_id = ? AND user_id = ? AND source = 'order_fulfillment'`,
      )
      .bind(o.id, userId)
      .all<{ quantity: number; occurred_at: string }>();

    for (let i = from; i <= due; i++) {
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
      // Purchase: the counterparty owes YOU delivery — their lateness is your income.
      const amount = o.type === "purchase" ? mag : -mag;
      stmts.push(
        db.prepare(
          `INSERT INTO accountant_entries
             (user_id, occurred_at, amount, category, source, order_id, tick_index, description)
           VALUES (?, ?, ?, 'financial', 'contract_fine', ?, ?, ?)`,
        ).bind(userId, ts, amount, o.id, i, `Late fine tick #${i}`),
      );
    }

    // Advance the bookmark for this order. user_id filter is defense-in-depth.
    stmts.push(
      db.prepare(
        "UPDATE accountant_orders SET last_fine_day = ? WHERE id = ? AND user_id = ?",
      ).bind(due, o.id, userId),
    );

    logs.push({ event: "accountant_fine_catchup", payload: { orderId: o.id, userId, from, to: due } });
  }

  return { stmts, logs };
}
