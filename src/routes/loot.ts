import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import {
  getLootItems,
  getLootByUuid,
  getLootLocationSummary,
  getLootLocationDetail,
  getUserLootCollection,
  addToLootCollection,
  setLootCollectionQuantity,
  removeFromLootCollection,
  getUserLootWishlist,
  addToLootWishlist,
  setLootWishlistQuantity,
  removeFromLootWishlist,
} from "../db/queries";
import { validate } from "../lib/validation";

// Auth middleware — reused for collection and wishlist sub-paths
async function requireUser(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  if (!c.get("user")) return c.json({ error: "Unauthorized" }, 401);
  return next();
}

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

  // Auth middleware for collection and wishlist
  app.use("/collection", requireUser);
  app.use("/collection/*", requireUser);
  app.use("/wishlist", requireUser);
  app.use("/wishlist/*", requireUser);

  // GET /api/loot/collection — current user's collected loot_map_ids
  app.get("/collection", async (c) => {
    const user = getAuthUser(c);
    const ids = await getUserLootCollection(c.env.DB, user.id);
    return c.json(ids);
  });

  // POST /api/loot/collection/:uuid — mark item collected
  app.post("/collection/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await addToLootCollection(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // PATCH /api/loot/collection/:uuid — set quantity; quantity=0 removes
  app.patch("/collection/:uuid",
    validate("json", z.object({ quantity: z.number().int().min(0, "quantity must be >= 0") })),
    async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");
    const { quantity } = c.req.valid("json");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    if (quantity === 0) {
      await removeFromLootCollection(c.env.DB, user.id, row.id);
    } else {
      await setLootCollectionQuantity(c.env.DB, user.id, row.id, quantity);
    }
    return c.json({ ok: true });
  });

  // DELETE /api/loot/collection/:uuid — unmark item collected
  app.delete("/collection/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await removeFromLootCollection(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // GET /api/loot/wishlist — current user's wishlisted items with location JSON
  app.get("/wishlist", async (c) => {
    const user = getAuthUser(c);
    const items = await getUserLootWishlist(c.env.DB, user.id);
    return c.json(items);
  });

  // POST /api/loot/wishlist/:uuid — add item to wishlist
  app.post("/wishlist/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await addToLootWishlist(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // PATCH /api/loot/wishlist/:uuid — set quantity; quantity=0 removes
  app.patch("/wishlist/:uuid",
    validate("json", z.object({ quantity: z.number().int().min(0, "quantity must be >= 0") })),
    async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");
    const { quantity } = c.req.valid("json");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    if (quantity === 0) {
      await removeFromLootWishlist(c.env.DB, user.id, row.id);
    } else {
      await setLootWishlistQuantity(c.env.DB, user.id, row.id, quantity);
    }
    return c.json({ ok: true });
  });

  // DELETE /api/loot/wishlist/:uuid — remove item from wishlist
  app.delete("/wishlist/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    const row = await c.env.DB
      .prepare("SELECT id FROM loot_map WHERE uuid = ? LIMIT 1")
      .bind(uuid)
      .first<{ id: number }>();
    if (!row) return c.json({ error: "Item not found" }, 404);

    await removeFromLootWishlist(c.env.DB, user.id, row.id);
    return c.json({ ok: true });
  });

  // GET /api/loot/locations — lightweight summary for POI directory (public)
  app.get("/locations", async (c) => {
    const data = await getLootLocationSummary(c.env.DB);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(data);
  });

  // GET /api/loot/locations/:type/:slug — items for a single location (public)
  app.get("/locations/:type/:slug", async (c) => {
    const type = c.req.param("type") as "container" | "shop" | "npc";
    if (!["container", "shop", "npc"].includes(type)) {
      return c.json({ error: "Invalid location type" }, 400);
    }
    const slug = decodeURIComponent(c.req.param("slug"));
    const data = await getLootLocationDetail(c.env.DB, type, slug);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(data);
  });

  // GET /api/loot/:uuid — full detail + location JSON (public)
  // ?patch=4.7.0-live.XXXXXXX to browse a specific patch; defaults to is_default patch
  // Must be last to avoid matching /collection and /wishlist
  app.get("/:uuid", async (c) => {
    const uuid = c.req.param("uuid");
    const patch = c.req.query("patch");
    const item = await getLootByUuid(c.env.DB, uuid, patch);
    if (!item) return c.json({ error: "Item not found" }, 404);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(item);
  });

  return app;
}
