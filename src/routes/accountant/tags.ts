import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../../lib/types";
import { validate } from "../../lib/validation";
import { DEFAULT_TAGS } from "../../lib/accountant/constants";
import { parseIdParam } from "./schemas";

const TagCreateSchema = z
  .object({
    category: z.literal("trading"), // only trading is user-extensible (master doc)
    name: z.string().min(1).max(50),
  })
  .strict();

/**
 * /api/accountant/tags — custom trading tags. Defaults are code constants
 * (DEFAULT_TAGS), never DB rows; only custom trading tags live in the table.
 */
export function tagsRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/accountant/tags — defaults (constants) + the user's custom tags
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const custom = await db
      .prepare("SELECT id, category, name FROM accountant_tags WHERE user_id = ? ORDER BY name")
      .bind(userID)
      .all();
    return c.json({ defaults: DEFAULT_TAGS, custom: custom.results });
  });

  // POST /api/accountant/tags
  routes.post("/", validate("json", TagCreateSchema), async (c) => {
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
      // name is COLLATE NOCASE, so the UNIQUE fires case-insensitively too.
      if (e instanceof Error && e.message.includes("UNIQUE")) {
        return c.json({ error: "Tag already exists" }, 409);
      }
      throw e;
    }
  });

  // DELETE /api/accountant/tags/:id — picker-only removal; entries keep the string
  routes.delete("/:id", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;
    const id = parseIdParam(c.req.param("id"));
    if (id === null) return c.json({ error: "Not found" }, 404);
    const result = await db
      .prepare("DELETE FROM accountant_tags WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .run();
    if ((result.meta.changes ?? 0) === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return routes;
}
