import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { categoryEnum, SORTING_PAGE, UNSORTED_PREDICATE } from "./schemas";

const BulkCategorizeSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(SORTING_PAGE),
    category: categoryEnum,
    tag: z.string().max(100).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

/**
 * /api/accountant/sorting — the verification queue (master doc: Verification List).
 * The queue is a QUERY, not a table: parsed entries with category IS NULL.
 */
export function sortingRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/accountant/sorting — oldest first (work the backlog top-down)
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const entries = await db
      .prepare(
        `SELECT * FROM accountant_entries
         WHERE user_id = ? AND ${UNSORTED_PREDICATE}
         ORDER BY occurred_at ASC, id ASC LIMIT ${SORTING_PAGE}`,
      )
      .bind(userID)
      .all();
    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM accountant_entries
         WHERE user_id = ? AND ${UNSORTED_PREDICATE}`,
      )
      .bind(userID)
      .first<{ n: number }>();
    return c.json({ entries: entries.results, count: countRow?.n ?? 0 });
  });

  // PUT /api/accountant/sorting/bulk — categorize one or many queue entries
  routes.put("/bulk", validate("json", BulkCategorizeSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const { ids, category, tag, note } = c.req.valid("json");

    const placeholders = ids.map(() => "?").join(",");
    const hasNote = note !== undefined && note !== "";
    const sql = hasNote
      ? `UPDATE accountant_entries SET category = ?, tag = ?, notes = ?
         WHERE id IN (${placeholders})
           AND user_id = ? AND ${UNSORTED_PREDICATE}`
      : `UPDATE accountant_entries SET category = ?, tag = ?
         WHERE id IN (${placeholders})
           AND user_id = ? AND ${UNSORTED_PREDICATE}`;
    const binds = hasNote
      ? [category, tag ?? null, note, ...ids, userID]
      : [category, tag ?? null, ...ids, userID];
    const result = await db.prepare(sql).bind(...binds).run();

    return c.json({ ok: true, updated: result.meta.changes ?? 0 });
  });

  return routes;
}
