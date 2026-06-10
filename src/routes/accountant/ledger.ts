import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { CATEGORIES, SOURCES } from "../../lib/accountant/constants";

/**
 * /api/accountant/* — ledger, sorting list, badges, tags.
 * Single-ledger architecture: balance = SUM(amount); the Sorting List is the
 * `category IS NULL AND source='parsed'` slice of accountant_entries.
 */

const categoryEnum = z.enum(CATEGORIES);

const ManualEntrySchema = z
  .object({
    amount: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999)
      .refine((n) => n !== 0, "amount must be non-zero"),
    category: categoryEnum.optional(),
    tag: z.string().max(100).optional(),
    occurred_at: z.string().min(1).max(50),
    location: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    adjustment: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.adjustment === true || b.category !== undefined, {
    message: "category is required for manual entries",
  });

export function ledgerRoutes() {
  const routes = new Hono<HonoEnv>();

  const PER_PAGE = 50;

  // GET /api/accountant/ledger?from&to&category&source&q&page
  // category/source are repeatable params. balance is ALWAYS the unfiltered sum.
  routes.get("/ledger", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);

    const categories = (c.req.queries("category") ?? []).filter((x) =>
      (CATEGORIES as readonly string[]).includes(x),
    );
    const sources = (c.req.queries("source") ?? []).filter((x) =>
      (SOURCES as readonly string[]).includes(x),
    );

    const where: string[] = ["user_id = ?"];
    const binds: (string | number)[] = [userID];
    const from = c.req.query("from");
    const to = c.req.query("to");
    const q = c.req.query("q");
    if (from) { where.push("occurred_at >= ?"); binds.push(from); }
    if (to) { where.push("occurred_at <= ?"); binds.push(to); }
    if (categories.length > 0) {
      where.push(`category IN (${categories.map(() => "?").join(",")})`);
      binds.push(...categories);
    }
    if (sources.length > 0) {
      where.push(`source IN (${sources.map(() => "?").join(",")})`);
      binds.push(...sources);
    }
    if (q) {
      where.push("(description LIKE ? OR location LIKE ? OR notes LIKE ?)");
      const like = `%${q}%`;
      binds.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const [entries, totalRow, balanceRow] = await Promise.all([
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
    ]);

    return c.json({
      entries: entries.results,
      total: totalRow?.n ?? 0,
      balance: balanceRow?.balance ?? 0,
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

  return routes;
}
