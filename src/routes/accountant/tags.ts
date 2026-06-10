import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { DEFAULT_TAGS } from "../../lib/accountant/constants";

const TagCreateSchema = z
  .object({
    category: z.literal("trading"), // only trading is user-extensible (master doc)
    name: z.string().min(1).max(50),
  })
  .strict();

/**
 * /api/accountant — badges (nav counts) + custom trading tags.
 * Badges are derived from live queries: no notifications table (design §2).
 */
export function tagsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/accountant/badges — nav badges + threshold (48h due-soon window)
  routes.get("/badges", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const [sorting, due, threshold] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_entries
         WHERE user_id = ? AND category IS NULL AND source = 'parsed'`,
      ).bind(userID).first<{ n: number }>(),
      db.prepare(
        `SELECT COUNT(*) AS n FROM accountant_loans
         WHERE user_id = ? AND status = 'open' AND due_at IS NOT NULL
           AND due_at <= datetime('now', '+48 hours')`,
      ).bind(userID).first<{ n: number }>(),
      db.prepare(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'accountantVerifyThreshold'",
      ).bind(userID).first<{ value: string }>(),
    ]);
    return c.json({
      sorting: sorting?.n ?? 0,
      loansDueSoon: due?.n ?? 0,
      sortingThreshold: threshold ? parseInt(threshold.value, 10) : 10,
    });
  });

  // GET /api/accountant/tags — defaults (constants) + the user's custom tags
  routes.get("/tags", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const custom = await db
      .prepare("SELECT id, category, name FROM accountant_tags WHERE user_id = ? ORDER BY name")
      .bind(userID)
      .all();
    return c.json({ defaults: DEFAULT_TAGS, custom: custom.results });
  });

  // POST /api/accountant/tags
  routes.post("/tags", validate("json", TagCreateSchema), async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const { category, name } = c.req.valid("json");
    if ((DEFAULT_TAGS[category] as readonly string[]).includes(name.toLowerCase())) {
      return c.json({ error: "Tag already exists" }, 409);
    }
    try {
      const result = await db
        .prepare("INSERT INTO accountant_tags (user_id, category, name) VALUES (?, ?, ?)")
        .bind(userID, category, name)
        .run();
      return c.json({ ok: true, id: result.meta.last_row_id });
    } catch (e) {
      if (e instanceof Error && e.message.includes("UNIQUE")) {
        return c.json({ error: "Tag already exists" }, 409);
      }
      throw e;
    }
  });

  // DELETE /api/accountant/tags/:id — picker-only removal; entries keep the string
  routes.delete("/tags/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const raw = c.req.param("id");
    if (!/^\d+$/.test(raw)) return c.json({ error: "Not found" }, 404);
    const id = parseInt(raw, 10);
    if (id <= 0) return c.json({ error: "Not found" }, 404);
    const result = await db
      .prepare("DELETE FROM accountant_tags WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .run();
    if ((result.meta.changes ?? 0) === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return routes;
}
