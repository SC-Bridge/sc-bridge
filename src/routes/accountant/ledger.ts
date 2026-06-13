import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { CATEGORIES, SOURCES } from "../../lib/accountant/constants";
import { categoryEnum, isoDatetime, parseIdParam } from "./schemas";
import { catchUp } from "../../lib/accountant/catchup";

/**
 * /api/accountant/ledger — list/filter, manual entries, edit, delete.
 * Single-ledger architecture: balance = SUM(amount); the Sorting List is the
 * `category IS NULL AND source='parsed'` slice of accountant_entries
 * (served by sorting.ts; badges by badges.ts; custom tags by tags.ts).
 */

const ManualEntrySchema = z
  .object({
    amount: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999)
      .refine((n) => n !== 0, "amount must be non-zero"),
    category: categoryEnum.optional(),
    tag: z.string().max(100).optional(),
    occurred_at: isoDatetime,
    location: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    adjustment: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.adjustment === true || b.category !== undefined, {
    message: "category is required for manual entries",
  });

const UpdateEntrySchema = z
  .object({
    category: categoryEnum.nullable().optional(),
    tag: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    amount: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999)
      .refine((n) => n !== 0, "amount must be non-zero").optional(),
    occurred_at: isoDatetime.optional(),
    location: z.string().max(200).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .strict();

export function ledgerRoutes() {
  const routes = new Hono<HonoEnv>();

  const PER_PAGE = 50;

  // GET /api/accountant/ledger?from&to&category&source&q&page
  // category/source are repeatable params. balance is ALWAYS the unfiltered sum.
  routes.get("/ledger", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    // Design §4.4: catch-up runs at the top of every ledger read.
    // No try/catch — catchUp throws on logic errors; Hono returns 500
    // ("fail rather than serve stale numbers", design §6).
    await catchUp(db, c.get("acctScope")!);
    // Upper clamp prevents hostile huge OFFSETs from forcing full-table scans.
    const page = Math.min(10000, Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1));

    const categories = (c.req.queries("category") ?? []).filter((x) =>
      (CATEGORIES as readonly string[]).includes(x),
    );
    const sources = (c.req.queries("source") ?? []).filter((x) =>
      (SOURCES as readonly string[]).includes(x),
    );

    const where: string[] = ["user_id = ?"];
    const binds: (string | number)[] = [userID];
    // Window bounds are normalized like every stored timestamp (isoDatetime)
    // so offset inputs and the `.000Z`-millisecond form compare correctly;
    // unparseable input keeps the old raw-compare behavior.
    const norm = (s: string | undefined): string | undefined => {
      if (!s) return undefined;
      const r = isoDatetime.safeParse(s);
      return r.success ? r.data : s;
    };
    const from = norm(c.req.query("from"));
    const to = norm(c.req.query("to"));
    const q = c.req.query("q");
    if (from) { where.push("occurred_at >= ?"); binds.push(from); }
    // HALF-OPEN upper bound — must match report-period.ts so report drill-down
    // links and ledger filters agree at window boundaries.
    if (to) { where.push("occurred_at < ?"); binds.push(to); }
    const tag = c.req.query("tag");
    if (tag) { where.push("tag = ?"); binds.push(tag); }
    if (categories.length > 0) {
      where.push(`category IN (${categories.map(() => "?").join(",")})`);
      binds.push(...categories);
    }
    if (sources.length > 0) {
      where.push(`source IN (${sources.map(() => "?").join(",")})`);
      binds.push(...sources);
    }
    if (q) {
      // Escape LIKE wildcards so user input matches literally ("50%" ≠ "everything with 50").
      where.push(
        "(description LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')",
      );
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      binds.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const [entries, totalRow, balanceRow, aggregatesRow] = await Promise.all([
      db
        .prepare(
          `SELECT * FROM accountant_entries WHERE ${whereSql}
           ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...binds, PER_PAGE, (page - 1) * PER_PAGE)
        .all(),
      db
        .prepare(`SELECT COUNT(*) AS n FROM accountant_entries WHERE ${whereSql}`)
        .bind(...binds)
        .first<{ n: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM accountant_entries WHERE user_id = ?")
        .bind(userID)
        .first<{ balance: number }>(),
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS sum_income,
                  COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS sum_expense
           FROM accountant_entries WHERE ${whereSql}`,
        )
        .bind(...binds)
        .first<{ sum_income: number; sum_expense: number }>(),
    ]);

    return c.json({
      entries: entries.results,
      total: totalRow?.n ?? 0,
      balance: balanceRow?.balance ?? 0,
      sum_income: aggregatesRow?.sum_income ?? 0,
      sum_expense: aggregatesRow?.sum_expense ?? 0,
      page,
    });
  });

  // POST /api/accountant/ledger — manual entry or balance adjustment
  routes.post("/ledger", validate("json", ManualEntrySchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const body = c.req.valid("json");

    const isAdjustment = body.adjustment === true;
    const result = await db
      .prepare(
        `INSERT INTO accountant_entries
           (user_id, occurred_at, amount, category, tag, source, description, location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userID,
        body.occurred_at,
        body.amount,
        isAdjustment ? null : body.category,
        isAdjustment ? null : (body.tag ?? null),
        isAdjustment ? "adjustment" : "manual",
        body.description ?? null,
        body.location ?? null,
        body.notes ?? null,
      )
      .run();

    return c.json({ ok: true, id: result.meta.last_row_id });
  });

  // Fields only editable on user-authored rows (manual/adjustment).
  const RESTRICTED_FIELDS = ["amount", "occurred_at", "location", "description"] as const;

  // PUT /api/accountant/ledger/:id
  routes.put("/ledger/:id", validate("json", UpdateEntrySchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");

    const row = await db
      .prepare("SELECT source, loan_id, order_id, workorder_id FROM accountant_entries WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ source: string; loan_id: number | null; order_id: number | null; workorder_id: number | null }>();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.loan_id !== null) {
      return c.json({ error: "Loan-linked entries are managed via the loan" }, 400);
    }
    if (row.order_id !== null) {
      return c.json({ error: "Order-linked entries are managed via the order" }, 400);
    }
    if (row.workorder_id !== null) {
      return c.json({ error: "Workorder-linked entries are managed via the workorder" }, 400);
    }
    const isUserAuthored = row.source === "manual" || row.source === "adjustment";
    if (!isUserAuthored && RESTRICTED_FIELDS.some((f) => body[f] !== undefined)) {
      return c.json({ error: "Only category, tag, and notes are editable on imported entries" }, 400);
    }

    const sets: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      sets.push(`${key} = ?`);
      binds.push(value as string | number | null);
    }
    if (sets.length === 0) return c.json({ ok: true });
    binds.push(id, userID);
    await db
      .prepare(`UPDATE accountant_entries SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
      .bind(...binds)
      .run();
    return c.json({ ok: true });
  });

  // DELETE /api/accountant/ledger/:id
  routes.delete("/ledger/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);

    const row = await db
      .prepare("SELECT loan_id, order_id, workorder_id FROM accountant_entries WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ loan_id: number | null; order_id: number | null; workorder_id: number | null }>();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.loan_id !== null) {
      return c.json({ error: "Loan-linked entries are managed via the loan" }, 400);
    }
    if (row.order_id !== null) {
      return c.json({ error: "Order-linked entries are managed via the order" }, 400);
    }
    if (row.workorder_id !== null) {
      return c.json({ error: "Workorder-linked entries are managed via the workorder" }, 400);
    }

    await db
      .prepare("DELETE FROM accountant_entries WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
