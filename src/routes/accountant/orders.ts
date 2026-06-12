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
import { effectiveRate, insertOrder, lockedInPOs } from "./order-helpers";

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

/** Row shape returned by `SELECT o.*` + correlated subselects on accountant_orders. */
interface OrderListRow {
  id: number;
  user_id: string;
  type: string;
  status: string;
  quantity: number;
  price_per_unit: number;
  deliver_by: string | null;
  rate_change_condition: string | null;
  rate_change_pct: number;
  fulfilled_qty: number;
  accrued_fines: number;
  [key: string]: unknown;
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

  return routes;
}
