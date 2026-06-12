import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVALS, catchUpAccruals } from "../../lib/accountant/accrual";
import {
  FINE_RATE_TYPES,
  ORDER_CATEGORIES,
  ORDER_STATUSES,
  ORDER_TYPES,
  RATE_CHANGE_CONDITIONS,
} from "../../lib/accountant/constants";
import { QTY_EPSILON, completionStatements, effectiveRate, insertOrder, lockedInPOs, openReserve } from "./order-helpers";
import { parseIdParam } from "./schemas";

// .strict() doubles as the private-market enforcement: vis_corp/vis_public are
// unknown keys here, so they're rejected with 400 and the columns keep DEFAULT 0.
const CreateOrderSchema = z.object({
  type: z.enum(ORDER_TYPES),
  category: z.enum(ORDER_CATEGORIES),               // mission_income structurally impossible
  tag: z.string().max(100).optional(),
  item: z.string().min(1).max(200),
  quantity: z.number().positive().max(1_000_000_000),
  price_per_unit: z.number().int().positive().max(9_999_999_999_999),
  counterparty: z.string().max(100).optional(),
  start_at: z.string().datetime({ offset: true }).max(50),
  deliver_by: z.string().datetime({ offset: true }).max(50).nullable().optional(),
  fine_interval: z.enum(INTERVALS).default("daily"),
  fine_rate_type: z.enum(FINE_RATE_TYPES).default("percent"),
  fine_rate: z.number().min(0).max(1_000_000_000).default(0.5),
  rate_change_condition: z.enum(RATE_CHANGE_CONDITIONS).nullable().optional(),
  rate_change_pct: z.number().min(0).max(1000).default(0),
  termination_clause: z.string().max(500).default("standard"),
  notes: z.string().max(2000).optional(),
}).strict();

// Contract terms are hard-locked at creation ("no modifications after
// agreement", master doc; owner ruling 10) — notes is the ONLY editable field;
// .strict() rejects every contract key with 400. Mirrors UpdateLoanSchema.
const UpdateOrderSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
}).strict();

// `{ quantity, occurred_at?, location?, amount? }` — server computes the effective
// rate (§5.3); `amount` overrides it (real deals deviate), sign applied by type.
const FulfillmentSchema = z.object({
  quantity: z.number().positive(),
  occurred_at: z.string().datetime({ offset: true }).max(50).optional(),
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
    const userID = getAuthUser(c).id;
    const b = c.req.valid("json");

    // Standalone orders never auto-attach to workorders (composition is Task 8).
    const result = await insertOrder(db, userID, b, null);
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
    await catchUpAccruals(db, userID);
    // Upper clamp prevents hostile huge OFFSETs from forcing full-table scans.
    const page = Math.min(10000, Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1));

    const where: string[] = ["o.user_id = ?"];
    const binds: (string | number)[] = [userID];
    const type = c.req.query("type");
    if (type && (ORDER_TYPES as readonly string[]).includes(type)) {
      where.push("o.type = ?"); binds.push(type);
    }
    const category = c.req.query("category");
    if (category && (ORDER_CATEGORIES as readonly string[]).includes(category)) {
      where.push("o.category = ?"); binds.push(category);
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
    await catchUpAccruals(db, userID);

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
    await catchUpAccruals(db, userID);

    const order = await db
      .prepare("SELECT * FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<OrderRow>();
    if (!order) return c.json({ error: "Not found" }, 404);
    if (order.status === "complete" || order.status === "cancelled") {
      return c.json({ error: "Order is closed" }, 400);
    }

    const sums = await db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN source = 'order_fulfillment' THEN quantity END), 0) AS fulfilled_qty,
         COALESCE(SUM(CASE WHEN source = 'po_reserve_release' THEN amount END), 0) AS prior_released
       FROM accountant_entries WHERE order_id = ? AND user_id = ?`,
    ).bind(id, userID).first<{ fulfilled_qty: number; prior_released: number }>();
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

    const stmts: D1PreparedStatement[] = [
      db.prepare(
        `INSERT INTO accountant_entries
           (user_id, occurred_at, amount, category, tag, source, quantity, price_per_unit, location, order_id, description)
         VALUES (?, ?, ?, ?, ?, 'order_fulfillment', ?, ?, ?, ?, ?)`,
      ).bind(
        userID, occurredAt, amount, order.category, order.tag, b.quantity,
        Math.round(rate), b.location ?? null, id, `Order fulfilment · O-${id}`,
      ),
    ];

    let release: number | undefined;
    if (order.type === "purchase") {
      // Proportional by quantity; the CLOSING fulfilment releases the exact
      // remainder — kills rounding drift and settles rate-change over/shortfall
      // (reserves are NOT re-reserved, §5.3).
      release = closing
        ? order.total - (sums?.prior_released ?? 0)
        : Math.round((order.total * b.quantity) / order.quantity);
      stmts.push(
        db.prepare(
          `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
           VALUES (?, ?, ?, NULL, 'po_reserve_release', ?, ?)`,
        ).bind(userID, occurredAt, release, id, `PO reserve release · O-${id}`),
      );
    }

    stmts.push(
      db.prepare("UPDATE accountant_orders SET status = ? WHERE id = ? AND user_id = ?").bind(status, id, userID),
    );
    if (order.workorder_id !== null) {
      stmts.push(...(await completionStatements(db, userID, order.workorder_id)));
    }

    await db.batch(stmts);
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
    await catchUpAccruals(db, userID);

    const order = await db
      .prepare("SELECT * FROM accountant_orders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<OrderRow>();
    if (!order) return c.json({ error: "Not found" }, 404);
    if (order.status === "complete" || order.status === "cancelled") {
      return c.json({ error: "Order already closed" }, 400);
    }

    const stmts: D1PreparedStatement[] = [];
    const open = await openReserve(db, userID, id);
    if (open > 0) {
      stmts.push(
        db.prepare(
          `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, order_id, description)
           VALUES (?, ?, ?, NULL, 'po_reserve_release', ?, ?)`,
        ).bind(userID, new Date().toISOString(), open, id, `PO reserve release · O-${id}`),
      );
    }
    stmts.push(
      db.prepare("UPDATE accountant_orders SET status = 'cancelled' WHERE id = ? AND user_id = ?").bind(id, userID),
    );
    // Finding 18: cancelling the last open component must advance the parent
    // workorder — same completion check the fulfilment path runs (Task 8 fills it).
    if (order.workorder_id !== null) {
      stmts.push(...(await completionStatements(db, userID, order.workorder_id)));
    }

    await db.batch(stmts);
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
