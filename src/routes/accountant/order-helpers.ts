import { ORDER_TEMPLATE } from "../../lib/accountant/constants";
import { scopeWhere, type Scope } from "../../lib/accountant/scope";

/**
 * Shared order machinery (design accountant-m5-design.md §5.0–§5.3) — used by
 * orders.ts and reused by workorders (Task 8). Orders are agreement state;
 * every aUEC movement is an order_id-linked accountant_entries row, so the
 * fund check and reserve math are plain SUM(amount) queries over the ledger.
 *
 * M4-A corp scope: every helper takes the resolved `scope` so reads/writes hit
 * the active ledger (private `user_id = ? AND org_id IS NULL` or corp `org_id = ?`).
 * Rows still stamp the acting `userID` for attribution; `org_id` = scope.orgId.
 * Queries keyed by a unique `order_id`/`workorder_id` need no user/org predicate —
 * an order (and its entries) belongs to exactly one scope by construction.
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

/** Σ open reserve across the active scope (positive number). Closed orders net to 0 by invariant. */
export async function lockedInPOs(db: D1Database, scope: Scope): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) AS locked FROM accountant_entries
     WHERE ${scope.sql} AND source IN ('po_reserve', 'po_reserve_release')`,
  ).bind(...scope.binds).first<{ locked: number }>();
  return row?.locked ?? 0;
}

/** Σ open reserve for ONE order (positive). −(Σ po_reserve + Σ po_reserve_release). */
export async function openReserve(db: D1Database, orderId: number): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) AS locked FROM accountant_entries
     WHERE order_id = ? AND source IN ('po_reserve', 'po_reserve_release')`,
  ).bind(orderId).first<{ locked: number }>();
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
 * the active scope's balance — reserves already in the ledger are inherently
 * counted, so concurrent POs cannot jointly overdraw. In corp mode the guard
 * reads the CORP wallet (scope predicate on the SUM), so a member's private
 * balance can neither fund nor block a corp PO. Zero rows written →
 * compensating DELETE + fundError.
 *
 * `publisher` is the posting account's display name SNAPSHOTTED at creation
 * (owner spec 2026-06-13; design §10 — the only identity the future public
 * market exposes). Stored, never joined: a later rename must not rewrite
 * historical orders. Immutable after creation (PUT is notes-only).
 */
export async function insertOrder(
  db: D1Database, scope: Scope, userID: string, b: ValidatedOrderBody, workorderId: number | null, publisher: string,
): Promise<OrderCreateResult> {
  const total = Math.round(b.quantity * b.price_per_unit);
  const mods = JSON.stringify(modifiedFields(b));
  // vis_corp/vis_public NOT in the column list — they keep their DEFAULT 0 (private market).
  // org_id = scope.orgId (NULL private); user_id = the acting member (attribution).
  const orderRes = await db.prepare(
    `INSERT INTO accountant_orders
       (user_id, org_id, publisher, type, category, tag, item, quantity, price_per_unit, total, counterparty, workorder_id,
        start_at, deliver_by, fine_interval, fine_rate_type, fine_rate,
        rate_change_condition, rate_change_pct, termination_clause, modified_fields, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    userID,
    scope.orgId,
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
        `INSERT INTO accountant_entries (user_id, org_id, occurred_at, amount, category, source, order_id, description)
         SELECT ?, ?, ?, ?, NULL, 'po_reserve', ?, ?
         WHERE (SELECT COALESCE(SUM(amount), 0) FROM accountant_entries WHERE ${scope.sql}) >= ?`,
      ).bind(userID, scope.orgId, now, -total, orderId, `PO reserve · O-${orderId}`, ...scope.binds, total).run();
      reserveWritten = guard.meta.changes ?? 0;
    } catch (err) {
      // A throw here would leave an open PO with NO reserve row — its closing
      // fulfilment would then release money that was never locked. Compensate
      // (loans.ts pattern — D1 has no interactive tx) and rethrow.
      await db.prepare(`DELETE FROM accountant_orders WHERE id = ? AND ${scope.sql}`).bind(orderId, ...scope.binds).run();
      throw err;
    }
    if (reserveWritten === 0) {
      // Whole creation "rolls back": compensating delete (loans.ts pattern — D1 has no interactive tx).
      await db.prepare(`DELETE FROM accountant_orders WHERE id = ? AND ${scope.sql}`).bind(orderId, ...scope.binds).run();
      const balRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) AS bal FROM accountant_entries WHERE ${scope.sql}`)
        .bind(...scope.binds).first<{ bal: number }>();
      return { fundError: { balance: balRow?.bal ?? 0, lockedInPOs: await lockedInPOs(db, scope), required: total } };
    }
  }
  return { id: orderId };
}

/**
 * One workorder per order: attachable = in-scope + status 'open' + not already
 * in a workorder. Friendly pre-validation read for precise error messages —
 * attachOrder's UPDATE re-checks the invariant atomically (TOCTOU guard).
 * Returns the error response payload or null when OK.
 */
export async function attachError(
  db: D1Database, scope: Scope, orderId: number,
): Promise<{ error: string; status: 400 | 404 } | null> {
  const order = await db
    .prepare(`SELECT status, workorder_id FROM accountant_orders WHERE id = ? AND ${scope.sql}`)
    .bind(orderId, ...scope.binds)
    .first<{ status: string; workorder_id: number | null }>();
  if (!order) return { error: "Order not found", status: 404 };
  if (order.workorder_id !== null) return { error: "Order already belongs to a workorder", status: 400 };
  if (order.status !== "open") return { error: "Only open orders can join a workorder", status: 400 };
  return null;
}

/**
 * Hardened attach (one workorder per order, design §4.2): the UPDATE itself
 * re-checks `workorder_id IS NULL AND status = 'open'` within scope, so an
 * attach that raced past the friendly pre-validation read (TOCTOU) changes 0
 * rows instead of silently re-parenting (or crossing scopes). Returns whether
 * the order was attached.
 */
export async function attachOrder(
  db: D1Database, scope: Scope, orderId: number, workorderId: number,
): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE accountant_orders SET workorder_id = ?
     WHERE id = ? AND ${scope.sql} AND workorder_id IS NULL AND status = 'open'`,
  ).bind(workorderId, orderId, ...scope.binds).run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Compensating "rollback" for a failed workorder creation (loans.ts pattern —
 * D1 has no interactive tx): detach the listed pre-existing standalone orders
 * FIRST so the by-workorder_id deletes only ever catch inline-created siblings
 * (and their reserve entries), then drop those and the workorder row.
 */
export async function rollbackWorkorderCreation(
  db: D1Database, scope: Scope, workorderId: number, detachIds: number[] = [],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  if (detachIds.length > 0) {
    stmts.push(db.prepare(
      `UPDATE accountant_orders SET workorder_id = NULL
       WHERE ${scope.sql} AND workorder_id = ? AND id IN (${detachIds.map(() => "?").join(", ")})`,
    ).bind(...scope.binds, workorderId, ...detachIds));
  }
  stmts.push(
    db.prepare(
      `DELETE FROM accountant_entries
       WHERE order_id IN (SELECT id FROM accountant_orders WHERE workorder_id = ? AND ${scope.sql})`,
    ).bind(workorderId, ...scope.binds),
    db.prepare(`DELETE FROM accountant_orders WHERE workorder_id = ? AND ${scope.sql}`).bind(workorderId, ...scope.binds),
    db.prepare(`DELETE FROM accountant_workorders WHERE id = ? AND ${scope.sql}`).bind(workorderId, ...scope.binds),
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
 *
 * Component subqueries key on `workorder_id` alone (org-wide by construction);
 * the workorder row itself is scope-guarded so a corp WO summary carries org_id.
 */
export async function completionStatements(
  db: D1Database, scope: Scope, userID: string, workorderId: number,
): Promise<D1PreparedStatement[]> {
  const now = new Date().toISOString();
  return [
    db.prepare(
      `UPDATE accountant_workorders SET status = 'in_progress'
       WHERE id = ? AND ${scope.sql} AND status = 'open'
         AND EXISTS (SELECT 1 FROM accountant_entries e
                     JOIN accountant_orders o ON e.order_id = o.id
                     WHERE o.workorder_id = ? AND e.source = 'order_fulfillment')`,
    ).bind(workorderId, ...scope.binds, workorderId),
    // Auto-generated text "W-0007 · 2 orders · net +412,000" — net is computed
    // by SQLite at execution time (printf's ',' flag does the en-US grouping).
    // It lands in `description` like every other engine-written row (fines,
    // accruals, fulfilments); `notes` is reserved for user prose.
    db.prepare(
      `INSERT INTO accountant_entries (user_id, org_id, occurred_at, amount, category, source, workorder_id, description)
       SELECT ?, ?, ?, 0, NULL, 'workorder_summary', ?,
              'W-' || printf('%04d', ?) || ' · ' || n.cnt || ' orders · net '
                || CASE WHEN n.net >= 0 THEN '+' ELSE '' END || printf('%,d', n.net)
       FROM (SELECT
               (SELECT COUNT(*) FROM accountant_orders
                WHERE workorder_id = ?) AS cnt,
               (SELECT COALESCE(SUM(e.amount), 0) FROM accountant_entries e
                JOIN accountant_orders o ON e.order_id = o.id
                WHERE o.workorder_id = ?
                  AND e.source = 'order_fulfillment') AS net) n
       WHERE NOT EXISTS (SELECT 1 FROM accountant_orders
                         WHERE workorder_id = ?
                           AND status IN ('open', 'in_progress'))
         AND (SELECT status FROM accountant_workorders WHERE id = ? AND ${scope.sql})
             IN ('open', 'in_progress')`,
    ).bind(userID, scope.orgId, now, workorderId, workorderId, workorderId, workorderId, workorderId, workorderId, ...scope.binds),
    db.prepare(
      `UPDATE accountant_workorders SET status = 'complete', completed_at = ?
       WHERE id = ? AND ${scope.sql} AND status IN ('open', 'in_progress')
         AND NOT EXISTS (SELECT 1 FROM accountant_orders
                         WHERE workorder_id = ?
                           AND status IN ('open', 'in_progress'))`,
    ).bind(now, workorderId, ...scope.binds, workorderId),
  ];
}

/**
 * The ONE po_reserve_release writer outside the fulfilment batch (order cancel,
 * workorder cancel, termination): releases the order's CURRENT open reserve,
 * with the amount computed BY SQLITE at batch-execution time. Self-guarding —
 * writes nothing when the reserve is already net 0 or the order is no longer
 * open/in_progress, so double releases are structurally impossible. Must be
 * batched BEFORE the statement that closes the order's status. The release row
 * carries the acting member (`userID`) + `scope.orgId` for attribution.
 */
export function releaseOpenReserveStmt(
  db: D1Database, scope: Scope, userID: string, orderId: number, now: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO accountant_entries (user_id, org_id, occurred_at, amount, category, source, order_id, description)
     SELECT ?, ?, ?, r.open, NULL, 'po_reserve_release', ?, ?
     FROM (SELECT COALESCE(-SUM(amount), 0) AS open FROM accountant_entries
           WHERE order_id = ? AND source IN ('po_reserve', 'po_reserve_release')) r
     WHERE r.open > 0
       AND EXISTS (SELECT 1 FROM accountant_orders
                   WHERE id = ? AND status IN ('open', 'in_progress'))`,
  ).bind(userID, scope.orgId, now, orderId, `PO reserve release · O-${orderId}`, orderId, orderId);
}

/**
 * The fulfilment batch for one order (§5.3), every statement re-guarded in SQL
 * at batch-execution time (TOCTOU): the order must still be open/in_progress
 * AND the new quantity must still fit Σ(fulfilled) + qty ≤ quantity + ε. A
 * raced cancel or closing fulfilment makes EVERY statement write zero rows —
 * the caller checks `results[fulfilmentIndex].meta.changes` and 409s. The GATE
 * keys on the unique `order_id`, so an order's fulfilments are org-wide (any
 * corp member's fulfilment counts); the new rows carry `userID` + `scope.orgId`.
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
  scope: Scope,
  userID: string,
  order: { id: number; type: string; category: string; tag: string | null; quantity: number; total: number },
  f: { quantity: number; occurredAt: string; amount: number; rate: number; location: string | null; closing: boolean },
): { stmts: D1PreparedStatement[]; fulfilmentIndex: number } {
  // Shared gate on the unique order_id: order still open/in_progress AND the new
  // qty still fits. Binds (in order): orderId, orderId, qty, order quantity, ε.
  const GATE = `EXISTS (SELECT 1 FROM accountant_orders
                  WHERE id = ? AND status IN ('open', 'in_progress'))
    AND (SELECT COALESCE(SUM(quantity), 0) FROM accountant_entries
         WHERE order_id = ? AND source = 'order_fulfillment') + ? <= ? + ?`;
  const gateBinds = [order.id, order.id, f.quantity, order.quantity, QTY_EPSILON];
  const stmts: D1PreparedStatement[] = [];

  if (order.type === "purchase") {
    const desc = `PO reserve release · O-${order.id}`;
    if (f.closing) {
      stmts.push(db.prepare(
        `INSERT INTO accountant_entries (user_id, org_id, occurred_at, amount, category, source, order_id, description)
         SELECT ?, ?, ?, r.open, NULL, 'po_reserve_release', ?, ?
         FROM (SELECT COALESCE(-SUM(amount), 0) AS open FROM accountant_entries
               WHERE order_id = ? AND source IN ('po_reserve', 'po_reserve_release')) r
         WHERE r.open > 0 AND ${GATE}`,
      ).bind(userID, scope.orgId, f.occurredAt, order.id, desc, order.id, ...gateBinds));
    } else {
      const partial = Math.floor((order.total * f.quantity) / order.quantity);
      if (partial > 0) {
        stmts.push(db.prepare(
          `INSERT INTO accountant_entries (user_id, org_id, occurred_at, amount, category, source, order_id, description)
           SELECT ?, ?, ?, ?, NULL, 'po_reserve_release', ?, ?
           WHERE ${GATE}`,
        ).bind(userID, scope.orgId, f.occurredAt, partial, order.id, desc, ...gateBinds));
      }
    }
  }

  const fulfilmentIndex = stmts.length;
  stmts.push(db.prepare(
    `INSERT INTO accountant_entries
       (user_id, org_id, occurred_at, amount, category, tag, source, quantity, price_per_unit, location, order_id, description)
     SELECT ?, ?, ?, ?, ?, ?, 'order_fulfillment', ?, ?, ?, ?, ?
     WHERE ${GATE}`,
  ).bind(
    userID, scope.orgId, f.occurredAt, f.amount, order.category, order.tag,
    f.quantity, f.rate, f.location, order.id, `Order fulfilment · O-${order.id}`, ...gateBinds,
  ));

  stmts.push(db.prepare(
    `UPDATE accountant_orders SET status = CASE
       WHEN quantity - (SELECT COALESCE(SUM(quantity), 0) FROM accountant_entries
                        WHERE order_id = ? AND source = 'order_fulfillment') <= ?
       THEN 'complete' ELSE 'in_progress' END
     WHERE id = ? AND status IN ('open', 'in_progress')
       AND EXISTS (SELECT 1 FROM accountant_entries
                   WHERE order_id = ? AND source = 'order_fulfillment')`,
  ).bind(order.id, QTY_EPSILON, order.id, order.id));

  return { stmts, fulfilmentIndex };
}

/**
 * Closing statements for the components a termination event targets (§5.4):
 * release each component's remaining reserve (amount computed in SQL at
 * execution time — no per-component pre-reads), then close the row — open →
 * 'cancelled'; partially-fulfilled (in_progress) closes 'complete'-as-is.
 */
export function closeComponentStatements(
  db: D1Database, scope: Scope, userID: string, targets: { id: number; status: string }[], now: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const o of targets) {
    stmts.push(releaseOpenReserveStmt(db, scope, userID, o.id, now));
    stmts.push(
      db.prepare(
        `UPDATE accountant_orders SET status = ?
         WHERE id = ? AND ${scope.sql} AND status IN ('open', 'in_progress')`,
      ).bind(o.status === "in_progress" ? "complete" : "cancelled", o.id, ...scope.binds),
    );
  }
  return stmts;
}

/**
 * Your incurred costs per component (design §5.4; Task 9's settlement
 * suggestion reuses this scope-aware helper): what was paid out on purchase
 * fulfilments plus fines paid (negative `contract_fine` rows — those live on
 * sale orders; purchase fines are income and don't count). Entry subqueries key
 * on order_id (org-wide by construction — any corp member's fulfilment counts).
 */
export async function incurredCosts(
  db: D1Database, scope: Scope, orderIds: number[],
): Promise<Map<number, number>> {
  if (orderIds.length === 0) return new Map();
  const placeholders = orderIds.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT o.id,
       (CASE WHEN o.type = 'purchase'
             THEN ABS(COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                                WHERE e.order_id = o.id
                                  AND e.source = 'order_fulfillment'), 0))
             ELSE 0 END)
       + ABS(COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                       WHERE e.order_id = o.id
                         AND e.source = 'contract_fine' AND e.amount < 0), 0)) AS incurred
     FROM accountant_orders o WHERE ${scopeWhere(scope, "o")} AND o.id IN (${placeholders})`,
  ).bind(...scope.binds, ...orderIds).all<{ id: number; incurred: number }>();
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
