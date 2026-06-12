import { ORDER_TEMPLATE } from "../../lib/accountant/constants";

/**
 * Shared order machinery (design accountant-m5-design.md §5.0–§5.3) — used by
 * orders.ts and reused by workorders (Task 8). Orders are agreement state;
 * every aUEC movement is an order_id-linked accountant_entries row, so the
 * fund check and reserve math are plain SUM(amount) queries over the ledger.
 */

/** Validated POST /orders body (CreateOrderSchema output, after Zod defaults). */
export interface ValidatedOrderBody {
  type: "sale" | "purchase";
  category: string;
  tag?: string;
  item: string;
  quantity: number;
  price_per_unit: number;
  counterparty?: string;
  start_at: string;
  deliver_by?: string | null;
  fine_interval: string;
  fine_rate_type: string;
  fine_rate: number;
  rate_change_condition?: string | null;
  rate_change_pct: number;
  termination_clause: string;
  notes?: string;
}

/** `quantity` is REAL (SCU can be fractional) — every remaining/closing comparison uses this epsilon. */
export const QTY_EPSILON = 1e-9;

/** Σ open reserve across the user (positive number). Closed orders net to 0 by invariant. */
export async function lockedInPOs(db: D1Database, userID: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) AS locked FROM accountant_entries
     WHERE user_id = ? AND source IN ('po_reserve', 'po_reserve_release')`,
  ).bind(userID).first<{ locked: number }>();
  return row?.locked ?? 0;
}

/** Σ open reserve for ONE order (positive). −(Σ po_reserve + Σ po_reserve_release). */
export async function openReserve(db: D1Database, userID: string, orderId: number): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) AS locked FROM accountant_entries
     WHERE user_id = ? AND order_id = ? AND source IN ('po_reserve', 'po_reserve_release')`,
  ).bind(userID, orderId).first<{ locked: number }>();
  return row?.locked ?? 0;
}

/** modified_fields = contract keys whose value deviates from ORDER_TEMPLATE (design §5.1). */
export function modifiedFields(contract: {
  deliver_by?: string | null; fine_interval: string; fine_rate_type: string; fine_rate: number;
  rate_change_condition?: string | null; rate_change_pct: number; termination_clause: string;
}): string[] {
  return Object.keys(ORDER_TEMPLATE).filter(
    (k) => (contract[k as keyof typeof contract] ?? null) !== ORDER_TEMPLATE[k as keyof typeof ORDER_TEMPLATE],
  );
}

export interface OrderCreateResult { id?: number; fundError?: { balance: number; lockedInPOs: number; required: number } }

/**
 * Insert an order; for purchases, book the reserve through the balance-guarded
 * INSERT…SELECT (§5.0). The guard subquery is the SAME SUM(amount) that defines
 * balance — reserves already in the ledger are inherently counted, so concurrent
 * POs cannot jointly overdraw. Zero rows written → compensating DELETE + fundError.
 *
 * `publisher` is the posting account's display name SNAPSHOTTED at creation
 * (owner spec 2026-06-13; design §10 — the only identity the future public
 * market exposes). Stored, never joined: a later rename must not rewrite
 * historical orders. Immutable after creation (PUT is notes-only).
 */
export async function insertOrder(
  db: D1Database, userID: string, b: ValidatedOrderBody, workorderId: number | null, publisher: string,
): Promise<OrderCreateResult> {
  const total = Math.round(b.quantity * b.price_per_unit);
  const mods = JSON.stringify(modifiedFields(b));
  // vis_corp/vis_public NOT in the column list — they keep their DEFAULT 0 (private-only).
  const orderRes = await db.prepare(
    `INSERT INTO accountant_orders
       (user_id, publisher, type, category, tag, item, quantity, price_per_unit, total, counterparty, workorder_id,
        start_at, deliver_by, fine_interval, fine_rate_type, fine_rate,
        rate_change_condition, rate_change_pct, termination_clause, modified_fields, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    userID,
    publisher,
    b.type,
    b.category,
    b.tag ?? null,
    b.item,
    b.quantity,
    b.price_per_unit,
    total,
    b.counterparty ?? null,
    workorderId,
    b.start_at,
    b.deliver_by ?? null,
    b.fine_interval,
    b.fine_rate_type,
    b.fine_rate,
    b.rate_change_condition ?? null,
    b.rate_change_pct,
    b.termination_clause,
    mods,
    b.notes ?? null,
  ).run();
  const orderId = orderRes.meta.last_row_id as number;

  if (b.type === "purchase") {
    const now = new Date().toISOString();
    let reserveWritten = 0;
    try {
      const guard = await db.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
         SELECT ?1, ?2, ?3, NULL, 'po_reserve', ?4, ?5
         WHERE (SELECT COALESCE(SUM(amount), 0) FROM accountant_entries WHERE user_id = ?1) >= ?6`,
      ).bind(userID, now, -total, orderId, `PO reserve · O-${orderId}`, total).run();
      reserveWritten = guard.meta.changes ?? 0;
    } catch (err) {
      // A throw here would leave an open PO with NO reserve row — its closing
      // fulfilment would then release money that was never locked. Compensate
      // (loans.ts pattern — D1 has no interactive tx) and rethrow.
      await db.prepare("DELETE FROM accountant_orders WHERE id = ? AND user_id = ?").bind(orderId, userID).run();
      throw err;
    }
    if (reserveWritten === 0) {
      // Whole creation "rolls back": compensating delete (loans.ts pattern — D1 has no interactive tx).
      await db.prepare("DELETE FROM accountant_orders WHERE id = ? AND user_id = ?").bind(orderId, userID).run();
      const balRow = await db.prepare("SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE user_id = ?")
        .bind(userID).first<{ bal: number }>();
      return { fundError: { balance: balRow?.bal ?? 0, lockedInPOs: await lockedInPOs(db, userID), required: total } };
    }
  }
  return { id: orderId };
}

/**
 * One workorder per order: attachable = mine + status 'open' + not already
 * in a workorder. Friendly pre-validation read for precise error messages —
 * attachOrder's UPDATE re-checks the invariant atomically (TOCTOU guard).
 * Returns the error response payload or null when OK.
 */
export async function attachError(
  db: D1Database, userID: string, orderId: number,
): Promise<{ error: string; status: 400 | 404 } | null> {
  const order = await db
    .prepare("SELECT status, workorder_id FROM accountant_orders WHERE id = ? AND user_id = ?")
    .bind(orderId, userID)
    .first<{ status: string; workorder_id: number | null }>();
  if (!order) return { error: "Order not found", status: 404 };
  if (order.workorder_id !== null) return { error: "Order already belongs to a workorder", status: 400 };
  if (order.status !== "open") return { error: "Only open orders can join a workorder", status: 400 };
  return null;
}

/**
 * Hardened attach (one workorder per order, design §4.2): the UPDATE itself
 * re-checks `workorder_id IS NULL AND status = 'open'`, so an attach that
 * raced past the friendly pre-validation read (TOCTOU) changes 0 rows instead
 * of silently re-parenting. Returns whether the order was attached.
 */
export async function attachOrder(
  db: D1Database, userID: string, orderId: number, workorderId: number,
): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE accountant_orders SET workorder_id = ?
     WHERE id = ? AND user_id = ? AND workorder_id IS NULL AND status = 'open'`,
  ).bind(workorderId, orderId, userID).run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Compensating "rollback" for a failed workorder creation (loans.ts pattern —
 * D1 has no interactive tx): detach the listed pre-existing standalone orders
 * FIRST so the by-workorder_id deletes only ever catch inline-created siblings
 * (and their reserve entries), then drop those and the workorder row.
 */
export async function rollbackWorkorderCreation(
  db: D1Database, userID: string, workorderId: number, detachIds: number[] = [],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  if (detachIds.length > 0) {
    stmts.push(db.prepare(
      `UPDATE accountant_orders SET workorder_id = NULL
       WHERE user_id = ? AND workorder_id = ? AND id IN (${detachIds.map(() => "?").join(", ")})`,
    ).bind(userID, workorderId, ...detachIds));
  }
  stmts.push(
    db.prepare(
      `DELETE FROM accountant_entries WHERE user_id = ?1
       AND order_id IN (SELECT id FROM accountant_orders WHERE workorder_id = ?2 AND user_id = ?1)`,
    ).bind(userID, workorderId),
    db.prepare("DELETE FROM accountant_orders WHERE workorder_id = ? AND user_id = ?").bind(workorderId, userID),
    db.prepare("DELETE FROM accountant_workorders WHERE id = ? AND user_id = ?").bind(workorderId, userID),
  );
  await db.batch(stmts);
}

/**
 * Statements that advance the parent workorder when a component order changes
 * inside the caller's batch (fulfilment, cancel, partial termination — finding
 * 18: completion must trigger on component cancel too). Every condition is a
 * SQL guard evaluated at BATCH-EXECUTION time, after the component's own
 * INSERT/UPDATE statements in the same transaction — so the in-flight change
 * (and the closing fulfilment's amount, for the net) is always visible:
 * - open → in_progress once any component fulfilment exists (never on a
 *   fulfilment-free cancel — an untouched workorder must stay cancellable);
 * - all components closed + workorder open/in_progress → ONE 0-amount
 *   `workorder_summary` entry + status 'complete' with completed_at stamped.
 * The 0-amount summary is informational: components already posted as they
 * fulfilled — a valued summary would double-count (the M3 loan-equity trap).
 */
export async function completionStatements(
  db: D1Database, userID: string, workorderId: number,
): Promise<D1PreparedStatement[]> {
  const now = new Date().toISOString();
  return [
    db.prepare(
      `UPDATE accountant_workorders SET status = 'in_progress'
       WHERE id = ?1 AND user_id = ?2 AND status = 'open'
         AND EXISTS (SELECT 1 FROM accountant_entries e
                     JOIN accountant_orders o ON e.order_id = o.id
                     WHERE o.workorder_id = ?1 AND e.user_id = ?2
                       AND e.source = 'order_fulfillment')`,
    ).bind(workorderId, userID),
    // Auto-generated text "W-0007 · 2 orders · net +412,000" — net is computed
    // by SQLite at execution time (printf's ',' flag does the en-US grouping).
    // It lands in `description` like every other engine-written row (fines,
    // accruals, fulfilments); `notes` is reserved for user prose.
    db.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, workorder_id, description)
       SELECT ?2, ?3, 0, NULL, 'workorder_summary', ?1,
              'W-' || printf('%04d', ?1) || ' · ' || n.cnt || ' orders · net '
                || CASE WHEN n.net >= 0 THEN '+' ELSE '' END || printf('%,d', n.net)
       FROM (SELECT
               (SELECT COUNT(*) FROM accountant_orders
                WHERE workorder_id = ?1 AND user_id = ?2) AS cnt,
               (SELECT COALESCE(SUM(e.amount), 0) FROM accountant_entries e
                JOIN accountant_orders o ON e.order_id = o.id
                WHERE o.workorder_id = ?1 AND e.user_id = ?2
                  AND e.source = 'order_fulfillment') AS net) n
       WHERE NOT EXISTS (SELECT 1 FROM accountant_orders
                         WHERE workorder_id = ?1 AND user_id = ?2
                           AND status IN ('open', 'in_progress'))
         AND (SELECT status FROM accountant_workorders WHERE id = ?1 AND user_id = ?2)
             IN ('open', 'in_progress')`,
    ).bind(workorderId, userID, now),
    db.prepare(
      `UPDATE accountant_workorders SET status = 'complete', completed_at = ?3
       WHERE id = ?1 AND user_id = ?2 AND status IN ('open', 'in_progress')
         AND NOT EXISTS (SELECT 1 FROM accountant_orders
                         WHERE workorder_id = ?1 AND user_id = ?2
                           AND status IN ('open', 'in_progress'))`,
    ).bind(workorderId, userID, now),
  ];
}

/**
 * The ONE po_reserve_release writer outside the fulfilment batch (order cancel,
 * workorder cancel, termination): releases the order's CURRENT open reserve,
 * with the amount computed BY SQLITE at batch-execution time. Self-guarding —
 * writes nothing when the reserve is already net 0 or the order is no longer
 * open/in_progress, so double releases are structurally impossible. Must be
 * batched BEFORE the statement that closes the order's status.
 */
export function releaseOpenReserveStmt(
  db: D1Database, userID: string, orderId: number, now: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
     SELECT ?1, ?2, r.open, NULL, 'po_reserve_release', ?3, ?4
     FROM (SELECT COALESCE(-SUM(amount), 0) AS open FROM accountant_entries
           WHERE user_id = ?1 AND order_id = ?3 AND source IN ('po_reserve', 'po_reserve_release')) r
     WHERE r.open > 0
       AND EXISTS (SELECT 1 FROM accountant_orders
                   WHERE id = ?3 AND user_id = ?1 AND status IN ('open', 'in_progress'))`,
  ).bind(userID, now, orderId, `PO reserve release · O-${orderId}`);
}

/**
 * The fulfilment batch for one order (§5.3), every statement re-guarded in SQL
 * at batch-execution time (TOCTOU): the order must still be open/in_progress
 * AND the new quantity must still fit Σ(fulfilled) + qty ≤ quantity + ε. A
 * raced cancel or closing fulfilment makes EVERY statement write zero rows —
 * the caller checks `results[fulfilmentIndex].meta.changes` and 409s.
 *
 * Purchase releases: partial = floor((total × qty) / quantity), so Σ(partials)
 * ≤ total structurally (rounding could overshoot and drive the closing release
 * negative); the CLOSING release is the order's open reserve computed by
 * SQLite at execution time — the reserve nets to exactly 0 and can never go
 * negative, even when a reserve row is missing or prior releases drifted.
 *
 * Status is derived from Σ(fulfilled) at execution time (not the pre-read),
 * so a guarded-out insert can never flip the status on stale data.
 */
export function fulfillmentStatements(
  db: D1Database,
  userID: string,
  order: { id: number; type: string; category: string; tag: string | null; quantity: number; total: number },
  f: { quantity: number; occurredAt: string; amount: number; rate: number; location: string | null; closing: boolean },
): { stmts: D1PreparedStatement[]; fulfilmentIndex: number } {
  // Shared gate — binds ?1 userID, ?2 occurredAt, ?3 orderId, ?4 qty, ?5 order quantity, ?6 ε.
  const GATE = `EXISTS (SELECT 1 FROM accountant_orders
                  WHERE id = ?3 AND user_id = ?1 AND status IN ('open', 'in_progress'))
    AND (SELECT COALESCE(SUM(quantity), 0) FROM accountant_entries
         WHERE order_id = ?3 AND user_id = ?1 AND source = 'order_fulfillment') + ?4 <= ?5 + ?6`;
  const stmts: D1PreparedStatement[] = [];

  if (order.type === "purchase") {
    const desc = `PO reserve release · O-${order.id}`;
    if (f.closing) {
      stmts.push(db.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
         SELECT ?1, ?2, r.open, NULL, 'po_reserve_release', ?3, ?7
         FROM (SELECT COALESCE(-SUM(amount), 0) AS open FROM accountant_entries
               WHERE user_id = ?1 AND order_id = ?3 AND source IN ('po_reserve', 'po_reserve_release')) r
         WHERE r.open > 0 AND ${GATE}`,
      ).bind(userID, f.occurredAt, order.id, f.quantity, order.quantity, QTY_EPSILON, desc));
    } else {
      const partial = Math.floor((order.total * f.quantity) / order.quantity);
      if (partial > 0) {
        stmts.push(db.prepare(
          `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
           SELECT ?1, ?2, ?7, NULL, 'po_reserve_release', ?3, ?8
           WHERE ${GATE}`,
        ).bind(userID, f.occurredAt, order.id, f.quantity, order.quantity, QTY_EPSILON, partial, desc));
      }
    }
  }

  const fulfilmentIndex = stmts.length;
  stmts.push(db.prepare(
    `INSERT INTO accountant_entries
       (user_id, occurred_at, amount, category, tag, source, quantity, price_per_unit, location, order_id, description)
     SELECT ?1, ?2, ?7, ?8, ?9, 'order_fulfillment', ?4, ?10, ?11, ?3, ?12
     WHERE ${GATE}`,
  ).bind(
    userID, f.occurredAt, order.id, f.quantity, order.quantity, QTY_EPSILON,
    f.amount, order.category, order.tag, f.rate, f.location, `Order fulfilment · O-${order.id}`,
  ));

  stmts.push(db.prepare(
    `UPDATE accountant_orders SET status = CASE
       WHEN quantity - (SELECT COALESCE(SUM(quantity), 0) FROM accountant_entries
                        WHERE order_id = ?1 AND user_id = ?2 AND source = 'order_fulfillment') <= ?3
       THEN 'complete' ELSE 'in_progress' END
     WHERE id = ?1 AND user_id = ?2 AND status IN ('open', 'in_progress')
       AND EXISTS (SELECT 1 FROM accountant_entries
                   WHERE order_id = ?1 AND user_id = ?2 AND source = 'order_fulfillment')`,
  ).bind(order.id, userID, QTY_EPSILON));

  return { stmts, fulfilmentIndex };
}

/**
 * Closing statements for the components a termination event targets (§5.4):
 * release each component's remaining reserve (amount computed in SQL at
 * execution time — no per-component pre-reads), then close the row — open →
 * 'cancelled'; partially-fulfilled (in_progress) closes 'complete'-as-is.
 */
export function closeComponentStatements(
  db: D1Database, userID: string, targets: { id: number; status: string }[], now: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const o of targets) {
    stmts.push(releaseOpenReserveStmt(db, userID, o.id, now));
    stmts.push(
      db.prepare(
        `UPDATE accountant_orders SET status = ?
         WHERE id = ? AND user_id = ? AND status IN ('open', 'in_progress')`,
      ).bind(o.status === "in_progress" ? "complete" : "cancelled", o.id, userID),
    );
  }
  return stmts;
}

/**
 * Your incurred costs per component (design §5.4; Task 9's settlement
 * suggestion reuses this scope-agnostic helper): what you paid out on purchase
 * fulfilments plus fines you paid (negative `contract_fine` rows — those live
 * on sale orders; purchase fines are income and don't count).
 */
export async function incurredCosts(
  db: D1Database, userID: string, orderIds: number[],
): Promise<Map<number, number>> {
  if (orderIds.length === 0) return new Map();
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT o.id,
       (CASE WHEN o.type = 'purchase'
             THEN ABS(COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                                WHERE e.order_id = o.id AND e.user_id = o.user_id
                                  AND e.source = 'order_fulfillment'), 0))
             ELSE 0 END)
       + ABS(COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                       WHERE e.order_id = o.id AND e.user_id = o.user_id
                         AND e.source = 'contract_fine' AND e.amount < 0), 0)) AS incurred
     FROM accountant_orders o WHERE o.user_id = ? AND o.id IN (${placeholders})`,
  ).bind(userID, ...orderIds).all<{ id: number; incurred: number }>();
  return new Map(rows.results.map((r) => [r.id, r.incurred]));
}

/** §5.3 — effective rate for the REMAINING quantity. Base never re-rates retroactively. */
export function effectiveRate(
  o: { price_per_unit: number; deliver_by: string | null; rate_change_condition: string | null; rate_change_pct: number },
  ctx: { occurredAtMs: number; fulfilledQty: number },
): number {
  const triggered =
    (o.rate_change_condition === "late" && o.deliver_by !== null && ctx.occurredAtMs > new Date(o.deliver_by).getTime()) ||
    (o.rate_change_condition === "partial" && ctx.fulfilledQty > 0);
  return triggered ? o.price_per_unit * (1 + o.rate_change_pct / 100) : o.price_per_unit;
}
