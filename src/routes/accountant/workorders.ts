import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { INTERVALS } from "../../lib/accountant/accrual";
import { catchUp } from "../../lib/accountant/catchup";
import {
  FINE_RATE_TYPES,
  RATE_CHANGE_CONDITIONS,
  WORKORDER_STATUSES,
} from "../../lib/accountant/constants";
import {
  attachError,
  attachOrder,
  closeComponentStatements,
  completionStatements,
  incurredCosts,
  insertOrder,
  modifiedFields,
  releaseOpenReserveStmt,
  rollbackWorkorderCreation,
} from "./order-helpers";
import { CreateOrderSchema } from "./orders";
import { isoDatetime, parseIdParam } from "./schemas";

// Same contract-term fields/defaults as orders; .strict() rejects
// vis_corp/vis_public (private market only) exactly like CreateOrderSchema.
const CreateWorkorderSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  counterparty: z.string().max(100).optional(),
  start_at: isoDatetime.optional(),
  deliver_by: isoDatetime.nullable().optional(),
  fine_interval: z.enum(INTERVALS).default("daily"),
  fine_rate_type: z.enum(FINE_RATE_TYPES).default("percent"),
  fine_rate: z.number().min(0).max(1_000_000_000).default(0.5),
  rate_change_condition: z.enum(RATE_CHANGE_CONDITIONS).nullable().optional(),
  rate_change_pct: z.number().min(0).max(1000).default(0),
  termination_clause: z.string().max(500).default("standard"),
  orders: z.array(CreateOrderSchema).max(20).optional(),
  order_ids: z.array(z.number().int().positive()).max(50).optional(),
}).strict();

// POST /:id/orders — attach an existing standalone order OR create one inside.
const AttachOrderSchema = z.object({
  order_id: z.number().int().positive().optional(),
  order: CreateOrderSchema.optional(),
}).strict().refine(
  (b) => (b.order_id === undefined) !== (b.order === undefined),
  { message: "Provide exactly one of order_id or order" },
);

// POST /:id/terminate (§5.4). The note is MANDATORY — dispute history (master
// doc); order_ids absent → FULL termination, present → PARTIAL (that subset only).
const TerminateSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  terminated_by: z.enum(["you", "counterparty"]),
  settlement_amount: z.number().int().min(0).max(9_999_999_999_999).optional(),
  order_ids: z.array(z.number().int().positive()).min(1).max(50).optional(),
}).strict();

/** Bare `SELECT *` row from accountant_workorders. */
interface WorkorderRow {
  id: number;
  user_id: string;
  title: string;
  status: string;
  modified_fields: string | null;
  completed_at: string | null;
  [key: string]: unknown;
}

/** List row: `SELECT w.*` + the correlated component subselects. */
interface WorkorderListRow extends WorkorderRow {
  component_count: number;
  completed_count: number;
  net_total: number;
}

/** Component row for the detail view: order columns + computed sums. */
interface ComponentRow {
  id: number;
  type: string;
  status: string;
  quantity: number;
  fulfilled_qty: number;
  fulfilled_net: number;
  [key: string]: unknown;
}

/** Workorder status for the :id routes — null when missing/foreign (→ 404). */
async function woStatus(db: D1Database, userID: string, id: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM accountant_workorders WHERE id = ? AND user_id = ?")
    .bind(id, userID)
    .first<{ status: string }>();
  return row?.status ?? null;
}

/**
 * /api/accountant/workorders — composition + contract lifecycle (design §4.2).
 * A workorder is pure agreement state grouping component orders; the only
 * ledger row it ever posts itself is the 0-amount completion summary
 * (completionStatements in order-helpers.ts, invoked from the ORDER batches).
 */
export function workordersRoutes() {
  const routes = new Hono<HonoEnv>();

  const PER_PAGE = 50;

  // POST /workorders — create as draft, optionally with inline new orders
  // and/or attached existing standalone open orders.
  routes.post("/", validate("json", CreateWorkorderSchema), async (c) => {
    const db = c.env.DB;
    const user = getAuthUser(c);
    const userID = user.id;
    const b = c.req.valid("json");

    // The §5.0 fund guard must read a CAUGHT-UP balance — materialize pending
    // lazy fine ticks before any inline order's guarded reserve INSERT.
    await catchUp(db, c.get("acctScope")!);

    // Pre-validate attachments before writing anything — cheaper than compensating.
    for (const orderId of b.order_ids ?? []) {
      const err = await attachError(db, userID, orderId);
      if (err) return c.json({ error: err.error }, err.status);
    }

    const woRes = await db.prepare(
      `INSERT INTO accountant_workorders
         (user_id, title, description, counterparty, start_at, deliver_by,
          fine_interval, fine_rate_type, fine_rate, rate_change_condition,
          rate_change_pct, termination_clause, modified_fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      userID,
      b.title,
      b.description ?? null,
      b.counterparty ?? null,
      b.start_at ?? null,
      b.deliver_by ?? null,
      b.fine_interval,
      b.fine_rate_type,
      b.fine_rate,
      b.rate_change_condition ?? null,
      b.rate_change_pct,
      b.termination_clause,
      JSON.stringify(modifiedFields(b)),
    ).run();
    const woId = woRes.meta.last_row_id as number;

    try {
      // Inline orders run the same fund check as standalone creation; the FIRST
      // failure rolls the whole creation back (loans.ts compensation pattern):
      // reserves of earlier inline siblings → the sibling order rows → the WO.
      // Components are real orders on the Market list — they snapshot the
      // poster's name as publisher exactly like standalone creation.
      for (const orderBody of b.orders ?? []) {
        const result = await insertOrder(db, userID, orderBody, woId, user.name);
        if (result.fundError) {
          await rollbackWorkorderCreation(db, userID, woId);
          return c.json({ error: "Insufficient funds", ...result.fundError }, 400);
        }
      }

      // Attach AFTER the inline loop — the rollback deletes by workorder_id and
      // must never catch a pre-existing standalone order. attachOrder's UPDATE
      // re-checks the one-WO-per-order invariant itself: a raced/duplicate attach
      // changes 0 rows → compensate the whole creation (detach-first).
      for (const orderId of b.order_ids ?? []) {
        if (!(await attachOrder(db, userID, orderId, woId))) {
          await rollbackWorkorderCreation(db, userID, woId, b.order_ids);
          return c.json({ error: "Order already attached or no longer open" }, 400);
        }
      }
    } catch (err) {
      // An unexpected throw mid-composition (e.g. a D1 failure between sibling
      // inserts) must not leave a half-built workorder behind — same
      // compensation as the validated failure paths, then rethrow → 500.
      await rollbackWorkorderCreation(db, userID, woId, b.order_ids);
      throw err;
    }

    return c.json({ ok: true, id: woId });
  });

  // GET /workorders?status&page — status is repeatable (orders-list pattern).
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    await catchUp(db, c.get("acctScope")!);
    const page = Math.min(10000, Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1));

    const where: string[] = ["w.user_id = ?"];
    const binds: (string | number)[] = [userID];
    const statuses = (c.req.queries("status") ?? []).filter((x) =>
      (WORKORDER_STATUSES as readonly string[]).includes(x),
    );
    if (statuses.length > 0) {
      where.push(`w.status IN (${statuses.map(() => "?").join(",")})`);
      binds.push(...statuses);
    }
    const whereSql = where.join(" AND ");

    const [workorders, totalRow] = await Promise.all([
      db.prepare(
        `SELECT w.*,
           (SELECT COUNT(*) FROM accountant_orders o
            WHERE o.workorder_id = w.id AND o.user_id = w.user_id) AS component_count,
           (SELECT COUNT(*) FROM accountant_orders o
            WHERE o.workorder_id = w.id AND o.user_id = w.user_id
              AND o.status = 'complete') AS completed_count,
           COALESCE((SELECT SUM(CASE WHEN o.type = 'sale' THEN o.total ELSE -o.total END)
                     FROM accountant_orders o
                     WHERE o.workorder_id = w.id AND o.user_id = w.user_id), 0) AS net_total
         FROM accountant_workorders w WHERE ${whereSql}
         ORDER BY w.created_at DESC, w.id DESC LIMIT ? OFFSET ?`,
      ).bind(...binds, PER_PAGE, (page - 1) * PER_PAGE).all<WorkorderListRow>(),
      db.prepare(`SELECT COUNT(*) AS n FROM accountant_workorders w WHERE ${whereSql}`)
        .bind(...binds)
        .first<{ n: number }>(),
    ]);

    return c.json({
      workorders: workorders.results.map((w) => ({
        ...w,
        componentCount: w.component_count,
        completedCount: w.completed_count,
        netTotal: w.net_total,
      })),
      total: totalRow?.n ?? 0,
      page,
    });
  });

  // GET /workorders/:id — contract + components w/ progress + incurred +
  // summary preview + settlement preview (suggestion = full-scope incurred
  // sum, §5.4 — Task 9's termination endpoint reuses the same helper).
  routes.get("/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    await catchUp(db, c.get("acctScope")!);

    const workorder = await db
      .prepare("SELECT * FROM accountant_workorders WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<WorkorderRow>();
    if (!workorder) return c.json({ error: "Not found" }, 404);

    const comps = await db.prepare(
      `SELECT o.*,
         COALESCE((SELECT SUM(e.quantity) FROM accountant_entries e
                   WHERE e.order_id = o.id AND e.user_id = o.user_id
                     AND e.source = 'order_fulfillment'), 0) AS fulfilled_qty,
         COALESCE((SELECT SUM(e.amount) FROM accountant_entries e
                   WHERE e.order_id = o.id AND e.user_id = o.user_id
                     AND e.source = 'order_fulfillment'), 0) AS fulfilled_net
       FROM accountant_orders o WHERE o.workorder_id = ? AND o.user_id = ?
       ORDER BY o.id ASC`,
    ).bind(id, userID).all<ComponentRow>();
    const incurred = await incurredCosts(db, userID, comps.results.map((o) => o.id));

    const components = comps.results.map((o) => ({
      ...o,
      modified_fields: JSON.parse((o.modified_fields as string | null) ?? "[]") as string[],
      fulfilledQty: o.fulfilled_qty,
      remaining: o.quantity - o.fulfilled_qty,
      incurred: incurred.get(o.id) ?? 0,
    }));

    return c.json({
      workorder: { ...workorder, modified_fields: JSON.parse(workorder.modified_fields ?? "[]") as string[] },
      components,
      summaryPreview: {
        netFulfilled: comps.results.reduce((s, o) => s + o.fulfilled_net, 0),
      },
      settlementPreview: {
        suggestion: components.reduce((s, o) => s + o.incurred, 0),
      },
    });
  });

  // POST /workorders/:id/orders — attach existing / create inside (draft + open only).
  routes.post("/:id/orders", validate("json", AttachOrderSchema), async (c) => {
    const db = c.env.DB;
    const user = getAuthUser(c);
    const userID = user.id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const b = c.req.valid("json");
    // §5.0 fund guard must read a caught-up balance (inline-order path below).
    await catchUp(db, c.get("acctScope")!);

    const status = await woStatus(db, userID, id);
    if (status === null) return c.json({ error: "Not found" }, 404);
    if (status !== "draft" && status !== "open") {
      return c.json({ error: "Components can only be added to a draft or open workorder" }, 400);
    }

    if (b.order_id !== undefined) {
      const err = await attachError(db, userID, b.order_id);
      if (err) return c.json({ error: err.error }, err.status);
      // The friendly pre-read above can race — the UPDATE enforces the invariant.
      if (!(await attachOrder(db, userID, b.order_id, id))) {
        return c.json({ error: "Order already attached or no longer open" }, 400);
      }
      return c.json({ ok: true, id: b.order_id });
    }

    const result = await insertOrder(db, userID, b.order!, id, user.name);
    if (result.fundError) {
      return c.json({ error: "Insufficient funds", ...result.fundError }, 400);
    }
    return c.json({ ok: true, id: result.id });
  });

  // DELETE /workorders/:id/orders/:orderId — detach (draft only); the order
  // survives standalone.
  routes.delete("/:id/orders/:orderId", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    const orderId = parseIdParam(c.req.param("orderId"));
    if (id === null || orderId === null) return c.json({ error: "Not found" }, 404);

    const status = await woStatus(db, userID, id);
    if (status === null) return c.json({ error: "Not found" }, 404);
    if (status !== "draft") {
      return c.json({ error: "Components can only be detached from a draft workorder" }, 400);
    }

    const order = await db
      .prepare("SELECT id FROM accountant_orders WHERE id = ? AND user_id = ? AND workorder_id = ?")
      .bind(orderId, userID, id)
      .first<{ id: number }>();
    if (!order) return c.json({ error: "Not found" }, 404);

    await db.prepare(
      "UPDATE accountant_orders SET workorder_id = NULL WHERE id = ? AND user_id = ?",
    ).bind(orderId, userID).run();
    return c.json({ ok: true });
  });

  // POST /workorders/:id/publish — draft → open; ≥ 2 component orders (master doc).
  routes.post("/:id/publish", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);

    const status = await woStatus(db, userID, id);
    if (status === null) return c.json({ error: "Not found" }, 404);
    if (status !== "draft") {
      return c.json({ error: "Only a draft workorder can be published" }, 400);
    }
    // Only OPEN components count — a dead (cancelled/closed) row must not
    // satisfy the gate (mirrors the cancel route's draft-component block).
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM accountant_orders WHERE workorder_id = ? AND user_id = ? AND status = 'open'")
      .bind(id, userID)
      .first<{ n: number }>();
    if ((count?.n ?? 0) < 2) {
      return c.json({ error: "A workorder needs at least 2 open component orders to publish" }, 400);
    }

    await db.prepare(
      "UPDATE accountant_workorders SET status = 'open' WHERE id = ? AND user_id = ?",
    ).bind(id, userID).run();
    return c.json({ ok: true });
  });

  // POST /workorders/:id/cancel — draft/open only ("before any work started");
  // cancels open components and releases their reserves in ONE batch.
  // in_progress needs the Task 9 termination settlement instead.
  routes.post("/:id/cancel", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);

    // Fines accrued while open must land before the close stops the clock.
    await catchUp(db, c.get("acctScope")!);

    const status = await woStatus(db, userID, id);
    if (status === null) return c.json({ error: "Not found" }, 404);
    if (status !== "draft" && status !== "open") {
      return c.json({
        error: status === "in_progress"
          ? "Work has started — terminate the workorder instead"
          : "Workorder already closed",
      }, 400);
    }

    const open = await db.prepare(
      `SELECT id FROM accountant_orders
       WHERE workorder_id = ? AND user_id = ? AND status IN ('open', 'in_progress')`,
    ).bind(id, userID).all<{ id: number }>();

    // Release amounts are computed in SQL at batch-execution time — no
    // per-component pre-reads; releases must precede the closing UPDATE.
    const now = new Date().toISOString();
    const stmts: D1PreparedStatement[] = open.results.map((o) =>
      releaseOpenReserveStmt(db, userID, o.id, now),
    );
    stmts.push(
      db.prepare(
        `UPDATE accountant_orders SET status = 'cancelled'
         WHERE workorder_id = ? AND user_id = ? AND status IN ('open', 'in_progress')`,
      ).bind(id, userID),
      db.prepare(
        "UPDATE accountant_workorders SET status = 'cancelled' WHERE id = ? AND user_id = ?",
      ).bind(id, userID),
    );

    await db.batch(stmts);
    return c.json({ ok: true });
  });

  // POST /workorders/:id/terminate — full + partial settlement (§5.4). The
  // terminator always forfeits: counterparty → +amount (you are refunded),
  // you → −amount (you compensate).
  routes.post("/:id/terminate", validate("json", TerminateSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const b = c.req.valid("json");

    // Fines accrued while open must land before the close stops the clock.
    await catchUp(db, c.get("acctScope")!);

    const status = await woStatus(db, userID, id);
    if (status === null) return c.json({ error: "Not found" }, 404);
    if (status !== "in_progress") {
      return c.json({ error: "Only an in-progress workorder can be terminated" }, 400);
    }

    const comps = await db.prepare(
      "SELECT id, status FROM accountant_orders WHERE workorder_id = ? AND user_id = ? ORDER BY id",
    ).bind(id, userID).all<{ id: number; status: string }>();
    const isOpen = (o: { status: string }) => o.status === "open" || o.status === "in_progress";

    // order_ids absent → FULL (all components; only open ones close); present →
    // PARTIAL: each target must be MY still-open component — 400 before any write.
    const full = b.order_ids === undefined;
    const byId = new Map(comps.results.map((o) => [o.id, o]));
    for (const oid of b.order_ids ?? []) {
      const comp = byId.get(oid);
      if (!comp) return c.json({ error: `Order ${oid} is not a component of this workorder` }, 400);
      if (!isOpen(comp)) return c.json({ error: `Order ${oid} is already closed` }, 400);
    }
    const targets = full ? comps.results.filter(isOpen) : b.order_ids!.map((oid) => byId.get(oid)!);

    // Advisory suggestion = Σ incurred over the WHOLE terminated scope —
    // including already-complete components on a full termination.
    const scopeIds = full ? comps.results.map((o) => o.id) : b.order_ids!;
    let suggestion: number | null = null;
    if (b.terminated_by === "counterparty") {
      const incurred = await incurredCosts(db, userID, scopeIds);
      suggestion = scopeIds.reduce((s, oid) => s + (incurred.get(oid) ?? 0), 0);
    } else if (b.settlement_amount === undefined) {
      // Counterparty's costs aren't on your books — no suggestion possible.
      return c.json({ error: "settlement_amount required when you terminate" }, 400);
    }
    const amount = b.settlement_amount ?? suggestion!;  // overridable; 0 legal
    const signed = b.terminated_by === "counterparty" ? amount : -amount;

    const now = new Date().toISOString();
    const stmts = closeComponentStatements(db, userID, targets, now);
    stmts.push(
      // ONE wo_settlement per event — the entry sequence IS the audit trail.
      db.prepare(
        `INSERT INTO accountant_entries (user_id, occurred_at, amount, category, source, workorder_id, notes, description)
         VALUES (?, ?, ?, 'financial', 'wo_settlement', ?, ?, ?)`,
      ).bind(userID, now, signed, id, b.note, `Termination settlement · ${b.terminated_by}`),
    );
    if (full) {
      stmts.push(
        db.prepare(
          `UPDATE accountant_workorders SET status = 'terminated', terminated_by = ?, termination_note = ?
           WHERE id = ? AND user_id = ?`,
        ).bind(b.terminated_by, b.note, id, userID),
      );
    } else {
      // A partial that closed the LAST open component completes the workorder
      // NORMALLY ('terminated' is reserved for full) — SQL guards self-arbitrate.
      stmts.push(...(await completionStatements(db, userID, id)));
    }

    await db.batch(stmts);
    // Partial may have closed the last open component (→ 'complete') — requery.
    const after = full ? "terminated" : await woStatus(db, userID, id);
    return c.json({ ok: true, settlement: amount, suggestion, scope: scopeIds, workorderStatus: after });
  });

  return routes;
}
