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
 */
export async function insertOrder(
  db: D1Database, userID: string, b: ValidatedOrderBody, workorderId: number | null,
): Promise<OrderCreateResult> {
  const total = Math.round(b.quantity * b.price_per_unit);
  const mods = JSON.stringify(modifiedFields(b));
  // vis_corp/vis_public NOT in the column list — they keep their DEFAULT 0 (private-only).
  const orderRes = await db.prepare(
    `INSERT INTO accountant_orders
       (user_id, type, category, tag, item, quantity, price_per_unit, total, counterparty, workorder_id,
        start_at, deliver_by, fine_interval, fine_rate_type, fine_rate,
        rate_change_condition, rate_change_pct, termination_clause, modified_fields, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    userID,
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
    const guard = await db.prepare(
      `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
       SELECT ?1, ?2, ?3, NULL, 'po_reserve', ?4, ?5
       WHERE (SELECT COALESCE(SUM(amount), 0) FROM accountant_entries WHERE user_id = ?1) >= ?6`,
    ).bind(userID, now, -total, orderId, `PO reserve · O-${orderId}`, total).run();
    if ((guard.meta.changes ?? 0) === 0) {
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
 * Statements that advance the parent workorder when a component order closes
 * (fulfilment completes it, cancel, partial termination). Task 8 wires
 * workorder transitions here; until then a component closing leaves the
 * workorder untouched.
 */
export async function completionStatements(
  _db: D1Database, _userID: string, _workorderId: number,
): Promise<D1PreparedStatement[]> {
  return [];
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
