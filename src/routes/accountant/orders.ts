import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVALS } from "../../lib/accountant/accrual";
import { catchUp } from "../../lib/accountant/catchup";
import {
  FINE_RATE_TYPES,
  ORDER_CATEGORIES,
  ORDER_STATUSES,
  ORDER_TYPES,
  RATE_CHANGE_CONDITIONS,
} from "../../lib/accountant/constants";
import {
  QTY_EPSILON,
  completionStatements,
  effectiveRate,
  fulfillmentStatements,
  insertOrder,
  lockedInPOs,
  openReserve,
  releaseOpenReserveStmt,
} from "./order-helpers";
import { isoDatetime, parseIdParam } from "./schemas";

// .strict() doubles as the private-market enforcement: vis_corp/vis_public are
// unknown keys here, so they're rejected with 400 and the columns keep DEFAULT 0.
// Exported: workorders.ts validates inline component orders with the same schema.
export const CreateOrderSchema = z.object({
  type: z.enum(ORDER_TYPES),
  category: z.enum(ORDER_CATEGORIES),               // mission_income structurally impossible
  tag: z.string().max(100).optional(),
  item: z.string().min(1).max(200),
  quantity: z.number().positive().max(1_000_000_000),
  price_per_unit: z.number().int().positive().max(9_999_999_999_999),
  counterparty: z.string().max(100).optional(),
  start_at: isoDatetime,
  deliver_by: isoDatetime.nullable().optional(),
  fine_interval: z.enum(INTERVALS).default("daily"),
  fine_rate_type: z.enum(FINE_RATE_TYPES).default("percent"),
  fine_rate: z.number().min(0).max(1_000_000_000).default(0.5),
  rate_change_condition: z.enum(RATE_CHANGE_CONDITIONS).nullable().optional(),
  rate_change_pct: z.number().min(0).max(1000).default(0),
  termination_clause: z.string().max(500).default("standard"),
  notes: z.string().max(2000).optional(),
}).strict().refine(
  // Both factors pass their individual caps, but the server-computed total
  // must also fit the aUEC ceiling shared by every amount column.
  (b) => b.quantity * b.price_per_unit <= 9_999_999_999_999,
  { message: "Order total exceeds the maximum aUEC amount" },
);

// Contract terms are hard-locked at creation ("no modifications after
// agreement", master doc; owner ruling 10) — notes is the ONLY editable field;
// .strict() rejects every contract key with 400 (publisher included: the
// posting-time snapshot is immutable). Mirrors UpdateLoanSchema.
const UpdateOrderSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
}).strict();

// `{ quantity, occurred_at?, location?, amount? }` — server computes the effective
// rate (§5.3); `amount` overrides it (real deals deviate), sign applied by type.
const FulfillmentSchema = z.object({
  quantity: z.number().positive(),
  occurred_at: isoDatetime.optional(),
  location: z.string().max(200).optional(),
  amount: z.number().int().positive().max(9_999_999_999_999).optional(),
}).strict();

/** Bare `SELECT *` row from accountant_orders (the :id handlers). */
interface OrderRow {
  id: number;
  user_id: string;
  type: string;
  status: string;
  category: string;
  tag: string | null;
  quantity: number;
  price_per_unit: number;
  total: number;
  deliver_by: string | null;
  rate_change_condition: string | null;
  rate_change_pct: number;
  workorder_id: number | null;
  modified_fields: string | null;
  [key: string]: unknown;
}

/** List row: `SELECT o.*` + the correlated fulfilment/fine subselects. */
interface OrderListRow extends OrderRow {
  fulfilled_qty: number;
  accrued_fines: number;
}

/**
 * /api/accountant/orders — order lifecycle (design §5.0–§5.1). Orders are
 * agreement state; the PO fund blocker is an atomic balance-guarded
 * INSERT…SELECT, and a sale order has ZERO ledger effect until fulfilment
 * (owner ruling 2026-06-12).
 */
export function ordersRoutes() {
  const routes = new Hono<HonoEnv>();

  const PER_PAGE = 50;

  // POST /orders — order row + (purchases only) the guarded po_reserve entry.
  routes.post("/", validate("json", CreateOrderSchema), async (c) => {
    const db = c.env.DB;
    const user = getAuthUser(c);
    const userID = user.id;
    const b = c.req.valid("json");

    // The §5.0 fund guard must read a CAUGHT-UP balance — materialize pending
    // lazy fine ticks before insertOrder's guarded reserve INSERT sums the ledger.
    await catchUp(db, userID);

    // Standalone orders never auto-attach to workorders (composition is Task 8).
    // user.name is snapshotted as the order's publisher (owner spec 2026-06-13).
    const result = await insertOrder(db, userID, b, null, user.name);
    if (result.fundError) {
      return c.json({ error: "Insufficient funds", ...result.fundError }, 400);
    }
    return c.json({ ok: true, id: result.id });
  });

  // GET /orders?type&category&status&q&page — status is repeatable (ledger's
  // category pattern). balance is ALWAYS the unfiltered sum (≡ available, §5.0).
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUp(db, userID);
    // Upper clamp prevents hostile huge OFFSETs from forcing full-table scans.
    const page = Math.min(10000, Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1));

    const where: string[] = ["o.user_id = ?"];
    const binds: (string | number)[] = [userID];
    // type/category/status are ALL repeatable — the Market filter renders each as
    // a multi-select checkbox group (getAll/append). Reading type/category as a
    // single value honored only the first checkbox; mirror status's IN pattern.
    const types = (c.req.queries("type") ?? []).filter((x) =>
      (ORDER_TYPES as readonly string[]).includes(x),
    );
    if (types.length > 0) {
      where.push(`o.type IN (${types.map(() => "?").join(",")})`);
      binds.push(...types);
    }
    const categories = (c.req.queries("category") ?? []).filter((x) =>
      (ORDER_CATEGORIES as readonly string[]).includes(x),
    );
    if (categories.length > 0) {
      where.push(`o.category IN (${categories.map(() => "?").join(",")})`);
      binds.push(...categories);
    }
    const statuses = (c.req.queries("status") ?? []).filter((x) =>
      (ORDER_STATUSES as readonly string[]).includes(x),
    );
    if (statuses.length > 0) {
      where.push(`o.status IN (${statuses.map(() => "?").join(",")})`);
      binds.push(...statuses);
    }
    const q = c.req.query("q");
    if (q) {
      // Escape LIKE wildcards so user input matches literally (ledger idiom).
      where.push(
        "(o.item LIKE ? ESCAPE '\\' OR o.counterparty LIKE ? ESCAPE '\\' OR o.notes LIKE ? ESCAPE '\\')",
      );
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      binds.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const [orders, totalRow, balanceRow, locked] = await Promise.all([
      db
        .prepare(
          `SELECT o.*,
             COALESCE((SELECT SUM(e.quantity) FROM accountant_entries e
                       WHERE e.order_id = o.id AND e.user_id = o.user_id
                         AND e.source = 'order_fulfillment'), 0) AS fulfilled_qty,
             COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                       WHERE e.order_id = o.id AND e.user_id = o.user_id
                         AND e.source = 'contract_fine'), 0) AS accrued_fines
           FROM accountant_orders o WHERE ${whereSql}
           ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...binds, PER_PAGE, (page - 1) * PER_PAGE)
        .all<OrderListRow>(),
      db
        .prepare(`SELECT COUNT(*) AS n FROM accountant_orders o WHERE ${whereSql}`)
        .bind(...binds)
        .first<{ n: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM accountant_entries WHERE user_id = ?")
        .bind(userID)
        .first<{ balance: number }>(),
      lockedInPOs(db, userID),
    ]);

    const nowMs = Date.now();
    const shaped = orders.results.map((o) => ({
      ...o,
      fulfilledQty: o.fulfilled_qty,
      remaining: o.quantity - o.fulfilled_qty,
      accruedFines: o.accrued_fines,
      effectiveRate: effectiveRate(o, { occurredAtMs: nowMs, fulfilledQty: o.fulfilled_qty }),
    }));

    return c.json({
      orders: shaped,
      total: totalRow?.n ?? 0,
      balance: balanceRow?.balance ?? 0,
      lockedInPOs: locked,
      page,
    });
  });

  // GET /orders/:id — contract + fulfilment/fine history + reserve state.
  routes.get("/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    await catchUp(db, userID);

    const order = await db
      .prepare("SELECT * FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<OrderRow>();
    if (!order) return c.json({ error: "Not found" }, 404);

    const [fulfillments, fines, reserveRow] = await Promise.all([
      db.prepare(
        `SELECT id, amount, quantity, price_per_unit, location, occurred_at FROM accountant_entries
         WHERE order_id = ? AND user_id = ? AND source = 'order_fulfillment'
         ORDER BY occurred_at ASC, id ASC`,
      ).bind(id, userID).all<{ quantity: number; amount: number }>(),
      db.prepare(
        `SELECT id, amount, occurred_at, tick_index FROM accountant_entries
         WHERE order_id = ? AND user_id = ? AND source = 'contract_fine'
         ORDER BY occurred_at ASC, id ASC`,
      ).bind(id, userID).all<{ amount: number }>(),
      db.prepare(
        `SELECT
           COALESCE(-SUM(CASE WHEN source = 'po_reserve' THEN amount END), 0) AS reserved,
           COALESCE(SUM(CASE WHEN source = 'po_reserve_release' THEN amount END), 0) AS released
         FROM accountant_entries WHERE order_id = ? AND user_id = ?`,
      ).bind(id, userID).first<{ reserved: number; released: number }>(),
    ]);

    const fulfilledQty = fulfillments.results.reduce((s, f) => s + f.quantity, 0);
    const reserved = reserveRow?.reserved ?? 0;
    const released = reserveRow?.released ?? 0;
    return c.json({
      order: { ...order, modified_fields: JSON.parse(order.modified_fields ?? "[]") as string[] },
      fulfillments: fulfillments.results,
      fines: fines.results,
      reserve: { reserved, released, open: reserved - released },
      computed: {
        fulfilledQty,
        remaining: order.quantity - fulfilledQty,
        accruedFines: fines.results.reduce((s, f) => s + f.amount, 0),
        effectiveRate: effectiveRate(order, { occurredAtMs: Date.now(), fulfilledQty }),
      },
    });
  });

  // POST /orders/:id/fulfillments — the real transaction (§5.3). One atomic batch:
  // order_fulfillment entry (+ proportional po_reserve_release for purchases,
  // closing release = exact remainder so the reserve nets to 0) + status update.
  routes.post("/:id/fulfillments", validate("json", FulfillmentSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const b = c.req.valid("json");

    // Fines must be current before the fulfilment lands (Task 6 swaps to combined catchUp).
    await catchUp(db, userID);

    const order = await db
      .prepare("SELECT * FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<OrderRow>();
    if (!order) return c.json({ error: "Not found" }, 404);
    if (order.status === "complete" || order.status === "cancelled") {
      return c.json({ error: "Order is closed" }, 400);
    }
    // Master-doc lifecycle: draft = "being built — not yet active"; work starts
    // at Open. Blocking draft components keeps the cancel "before any work
    // started" gate and the publish component count honest.
    if (order.workorder_id !== null) {
      const wo = await db.prepare(
        "SELECT status FROM accountant_workorders WHERE id = ? AND user_id = ?",
      ).bind(order.workorder_id, userID).first<{ status: string }>();
      if (wo?.status === "draft") {
        return c.json({ error: "Workorder is draft - publish it before recording work" }, 400);
      }
    }

    const sums = await db.prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS fulfilled_qty FROM accountant_entries
       WHERE order_id = ? AND user_id = ? AND source = 'order_fulfillment'`,
    ).bind(id, userID).first<{ fulfilled_qty: number }>();
    const fulfilledQty = sums?.fulfilled_qty ?? 0;
    const remaining = order.quantity - fulfilledQty;
    if (b.quantity > remaining + QTY_EPSILON) {
      return c.json({ error: "Quantity exceeds remaining", remaining }, 400);
    }

    const occurredAt = b.occurred_at ?? new Date().toISOString();
    const rate = effectiveRate(order, { occurredAtMs: new Date(occurredAt).getTime(), fulfilledQty });
    const mag = b.amount ?? Math.round(b.quantity * rate);
    const amount = order.type === "sale" ? mag : -mag;
    const closing = remaining - b.quantity <= QTY_EPSILON;
    const status = closing ? "complete" : "in_progress";

    // Response figure only — the batched statements compute their own amounts
    // in SQL at execution time (fulfillmentStatements): floor-based partial
    // release, exact open reserve on the closing fulfilment (§5.3, reserves
    // are NOT re-reserved; closed orders net to exactly 0).
    let release: number | undefined;
    if (order.type === "purchase") {
      release = closing
        ? await openReserve(db, userID, id)
        : Math.floor((order.total * b.quantity) / order.quantity);
    }

    const { stmts, fulfilmentIndex } = fulfillmentStatements(db, userID, order, {
      quantity: b.quantity, occurredAt, amount, rate: Math.round(rate),
      location: b.location ?? null, closing,
    });
    if (order.workorder_id !== null) {
      stmts.push(...(await completionStatements(db, userID, order.workorder_id)));
    }

    const results = await db.batch(stmts);
    // The reads above are friendly pre-validation only — the batch re-checks
    // status + remaining in SQL. Zero rows = a concurrent close/fulfilment won.
    if ((results[fulfilmentIndex].meta.changes ?? 0) === 0) {
      return c.json({ error: "Order changed concurrently - retry" }, 409);
    }
    return c.json({ ok: true, amount, ...(release !== undefined ? { release } : {}), status });
  });

  // POST /orders/:id/cancel — release the remaining reserve and close the order.
  // Fines stop automatically: tick eligibility excludes closed statuses.
  routes.post("/:id/cancel", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);

    // Fines accrued while open must land before the close stops the clock
    // (Task 6 swaps to combined catchUp).
    await catchUp(db, userID);

    const order = await db
      .prepare("SELECT * FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<OrderRow>();
    if (!order) return c.json({ error: "Not found" }, 404);
    if (order.status === "complete" || order.status === "cancelled") {
      return c.json({ error: "Order already closed" }, 400);
    }
    // Draft = "being built": detach is the draft-time tool. Cancelling a draft
    // component would silently shrink the publish gate's open-component count.
    if (order.workorder_id !== null) {
      const wo = await db.prepare(
        "SELECT status FROM accountant_workorders WHERE id = ? AND user_id = ?",
      ).bind(order.workorder_id, userID).first<{ status: string }>();
      if (wo?.status === "draft") {
        return c.json({ error: "Workorder is draft - detach the component instead of cancelling it" }, 400);
      }
    }

    // Response figure only — the batched release computes the actual amount in
    // SQL at execution time and self-guards against a raced close (net 0 stays 0).
    const open = await openReserve(db, userID, id);
    const stmts: D1PreparedStatement[] = [
      releaseOpenReserveStmt(db, userID, id, new Date().toISOString()),
      db.prepare(
        `UPDATE accountant_orders SET status = 'cancelled'
         WHERE id = ? AND user_id = ? AND status IN ('open', 'in_progress')`,
      ).bind(id, userID),
    ];
    const statusIndex = 1;
    // Finding 18: cancelling the last open component must advance the parent
    // workorder — same completion check the fulfilment path runs (Task 8 fills it).
    if (order.workorder_id !== null) {
      stmts.push(...(await completionStatements(db, userID, order.workorder_id)));
    }

    const results = await db.batch(stmts);
    // Status guard lost = a concurrent fulfilment/cancel closed the order first;
    // the release's own status gate wrote nothing either.
    if ((results[statusIndex].meta.changes ?? 0) === 0) {
      return c.json({ error: "Order already closed" }, 409);
    }
    return c.json({ ok: true, released: open });
  });

  // PUT /orders/:id — notes only (UpdateOrderSchema hard-locks the contract).
  routes.put("/:id", validate("json", UpdateOrderSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");

    const exists = await db
      .prepare("SELECT id FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ id: number }>();
    if (!exists) return c.json({ error: "Not found" }, 404);

    if (body.notes === undefined) return c.json({ ok: true });
    await db
      .prepare("UPDATE accountant_orders SET notes = ? WHERE id = ? AND user_id = ?")
      .bind(body.notes ?? null, id, userID)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
