import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import {
  getLootItems,
  getLootByUuid,
  getUserLootCollection,
  addToLootCollection,
  removeFromLootCollection,
} from "../db/queries";

/**
 * /api/loot — Loot/item finder (public browsing, auth-gated collection tracking)
 */
export function lootRoutes() {
  const app = new Hono<HonoEnv>();

  // GET /api/loot — all items (public), no JSON blobs
  // ?patch=4.7.0-live.XXXXXXX to browse a specific patch; defaults to is_default patch
  // Cache-Control: public, max-age=300 (CDN caches 5 min)
  app.get("/", async (c) => {
    const patch = c.req.query("patch");
    const items = await getLootItems(c.env.DB, patch);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(items);
  });

  // GET /api/loot/collection — current user's collected loot_map_ids (auth required)
  app.get("/collection", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ids = await getUserLootCollection(c.env.DB, user.id);
    return c.json(ids);
  });

  // POST /api/loot/collection/:uuid — mark item collected (auth required)
  app.post("/collection/:uuid", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await addToLootCollection(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // DELETE /api/loot/collection/:uuid — unmark item collected (auth required)
  app.delete("/collection/:uuid", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await removeFromLootCollection(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // GET /api/loot/:uuid — full detail + location JSON (public)
  // ?patch=4.7.0-live.XXXXXXX to browse a specific patch; defaults to is_default patch
  // Must be last to avoid matching /collection
  app.get("/:uuid", async (c) => {
    const uuid = c.req.param("uuid");
    const patch = c.req.query("patch");
    const item = await getLootByUuid(c.env.DB, uuid, patch);
    if (!item) return c.json({ error: "Item not found" }, 404);
    return c.json(item);
  });

  return app;
}
