import { Hono, type Context, type Next } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { SET_SLUG_REWARD_TEXTS } from "../lib/loot-sets";
import {
  getLootItems,
  getLootByUuid,
  getLootLocationSummary,
  getLootLocationDetail,
  getUserLootCollection,
  getUserCraftedByLootUuid,
  addToLootCollection,
  setLootCollectionQuantity,
  removeFromLootCollection,
  getUserLootWishlist,
  addToLootWishlist,
  setLootWishlistQuantity,
  removeFromLootWishlist,
  getLootSets,
  getLootSetBySlug,
  reportUserItemPrice,
} from "../db/queries";
import { validate } from "../lib/validation";
import { cachedJson, cacheSlug, purgeByPrefix } from "../lib/cache";
import { getActiveChannel, isPTUChannel } from "../lib/ptu";

// Auth middleware — reused for collection and wishlist sub-paths
async function requireUser(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  if (!c.get("user")) return c.json({ error: "Unauthorized" }, 401);
  return next();
}

/**
 * Verify a uuid maps to a real loot_map row in either channel. Returns
 * the matching channel for telemetry / 404 handling. The collection
 * and wishlist tables now key on uuid (mig 0225), so we no longer need
 * an id translation step — just confirm the uuid exists somewhere.
 */
async function lootUuidExists(
  db: D1Database,
  uuid: string,
): Promise<"live" | "ptu" | null> {
  const live = await db
    .prepare("SELECT 1 FROM loot_map WHERE uuid = ? LIMIT 1")
    .bind(uuid)
    .first();
  if (live) return "live";
  const ptu = await db
    .prepare("SELECT 1 FROM ptu_loot_map WHERE uuid = ? LIMIT 1")
    .bind(uuid)
    .first();
  if (ptu) return "ptu";
  return null;
}

/**
 * /api/loot — Loot/item finder (public browsing, auth-gated collection tracking)
 */
export function lootRoutes() {
  const app = new Hono<HonoEnv>();

  // GET /api/loot — all items (public), no JSON blobs
  app.get("/", async (c) => {
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(c, `loot:items:${channel.toLowerCase()}`, () =>
      getLootItems(c.env.DB, isPTU),
    );
  });

  // Auth middleware for collection, wishlist, and crafted counters
  app.use("/collection", requireUser);
  app.use("/collection/*", requireUser);
  app.use("/wishlist", requireUser);
  app.use("/wishlist/*", requireUser);
  app.use("/crafted", requireUser);

  // GET /api/loot/crafted — per-uuid crafted totals for the current user.
  // Sums user_blueprints.crafted_quantity + user_blueprint_builds.crafted_quantity,
  // joined to loot items via blueprint output_item → loot_map.class_name
  // across both LIVE and PTU channels.
  app.get("/crafted", async (c) => {
    const user = getAuthUser(c);
    const map = await getUserCraftedByLootUuid(c.env.DB, user.id);
    return c.json(map);
  });

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

    if (!(await lootUuidExists(c.env.DB, uuid))) {
      return c.json({ error: "Item not found" }, 404);
    }
    await addToLootCollection(c.env.DB, user.id, uuid);
    return c.json({ ok: true });
  });

  // PATCH /api/loot/collection/:uuid — set quantity; quantity=0 removes
  app.patch("/collection/:uuid",
    validate("json", z.object({ quantity: z.number().int().min(0, "quantity must be >= 0") })),
    async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");
    const { quantity } = c.req.valid("json");

    if (!(await lootUuidExists(c.env.DB, uuid))) {
      return c.json({ error: "Item not found" }, 404);
    }
    if (quantity === 0) {
      await removeFromLootCollection(c.env.DB, user.id, uuid);
    } else {
      await setLootCollectionQuantity(c.env.DB, user.id, uuid, quantity);
    }
    return c.json({ ok: true });
  });

  // DELETE /api/loot/collection/:uuid — unmark item collected
  app.delete("/collection/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    // No existence check on DELETE — idempotent
    await removeFromLootCollection(c.env.DB, user.id, uuid);
    return c.json({ ok: true });
  });

  // GET /api/loot/wishlist — current user's wishlisted items with location JSON
  app.get("/wishlist", async (c) => {
    const user = getAuthUser(c);
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    const items = await getUserLootWishlist(c.env.DB, user.id, isPTU);
    return c.json(items);
  });

  // POST /api/loot/wishlist/:uuid — add item to wishlist
  app.post("/wishlist/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    if (!(await lootUuidExists(c.env.DB, uuid))) {
      return c.json({ error: "Item not found" }, 404);
    }
    await addToLootWishlist(c.env.DB, user.id, uuid);
    return c.json({ ok: true });
  });

  // PATCH /api/loot/wishlist/:uuid — set quantity; quantity=0 removes
  app.patch("/wishlist/:uuid",
    validate("json", z.object({ quantity: z.number().int().min(0, "quantity must be >= 0") })),
    async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");
    const { quantity } = c.req.valid("json");

    if (!(await lootUuidExists(c.env.DB, uuid))) {
      return c.json({ error: "Item not found" }, 404);
    }
    if (quantity === 0) {
      await removeFromLootWishlist(c.env.DB, user.id, uuid);
    } else {
      await setLootWishlistQuantity(c.env.DB, user.id, uuid, quantity);
    }
    return c.json({ ok: true });
  });

  // DELETE /api/loot/wishlist/:uuid — remove item from wishlist
  app.delete("/wishlist/:uuid", async (c) => {
    const user = getAuthUser(c);
    const uuid = c.req.param("uuid");

    // No existence check on DELETE — idempotent
    await removeFromLootWishlist(c.env.DB, user.id, uuid);
    return c.json({ ok: true });
  });

  // GET /api/loot/locations — lightweight summary for POI directory (public)
  app.get("/locations", async (c) => {
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(c, `loot:loc-summary:${channel.toLowerCase()}`, () =>
      getLootLocationSummary(c.env.DB, isPTU),
    );
  });

  // GET /api/loot/locations/:type/:slug — items for a single location (public)
  // Accepts both singular (container) and plural (containers) for convenience
  app.get("/locations/:type/:slug", async (c) => {
    let type = c.req.param("type") as string;
    // Normalize plural to singular
    if (type === "containers") type = "container";
    else if (type === "shops") type = "shop";
    else if (type === "npcs") type = "npc";
    else if (type === "contracts") type = "contract";
    if (!["container", "shop", "npc", "contract"].includes(type)) {
      return c.json({ error: "Invalid location type" }, 400);
    }
    const slug = decodeURIComponent(c.req.param("slug"));
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(
      c,
      `loot:loc-detail:${type}:${cacheSlug(slug)}:${channel.toLowerCase()}`,
      () =>
        getLootLocationDetail(
          c.env.DB,
          type as "container" | "shop" | "npc" | "contract",
          slug,
          isPTU,
        ),
    );
  });

  // GET /api/loot/sets — list all armor sets (public)
  app.get("/sets", async (c) => {
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(c, `loot:sets:${channel.toLowerCase()}`, () =>
      getLootSets(c.env.DB, isPTU),
    );
  });

  // GET /api/loot/sets/:setSlug — full set detail with pieces, stats, locations (public)
  app.get("/sets/:setSlug", async (c) => {
    const setSlug = c.req.param("setSlug");
    if (setSlug.length > 200) return c.json({ error: "Not found" }, 404);
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(
      c,
      `loot:set-detail:${cacheSlug(setSlug)}:${channel.toLowerCase()}`,
      async () => {
        const set = await getLootSetBySlug(c.env.DB, setSlug, isPTU);
        if (!set) return null;

        const rewardTexts = SET_SLUG_REWARD_TEXTS[setSlug];
        let awardingContracts: { id: number; title: string; giver_slug: string }[] = [];
        if (rewardTexts && rewardTexts.length > 0) {
          const placeholders = rewardTexts.map(() => "?").join(",");
          const result = await c.env.DB
            .prepare(`SELECT id, title, giver_slug FROM contracts WHERE reward_text IN (${placeholders})`)
            .bind(...rewardTexts)
            .all<{ id: number; title: string; giver_slug: string }>();
          awardingContracts = result.results ?? [];
        }

        return { ...set, awardingContracts };
      },
    );
  });

  // POST /api/loot/:uuid/report-price — community price report (auth required).
  // Stored like UEX/companion data: source='user' in the same tables, so it
  // surfaces through the standard shop-availability query.
  app.post(
    "/:uuid/report-price",
    requireUser,
    validate(
      "json",
      z
        .object({
          shopId: z.number().int().positive(),
          buyPrice: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
          sellPrice: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
        })
        .refine((b) => b.buyPrice != null || b.sellPrice != null, {
          message: "Provide a buy and/or sell price",
        }),
    ),
    async (c) => {
      const uuid = c.req.param("uuid");
      const { shopId, buyPrice, sellPrice } = c.req.valid("json");
      const userId = getAuthUser(c).id;
      const channel = getActiveChannel(c);
      const isPTU = isPTUChannel(channel);
      const result = await reportUserItemPrice(
        c.env.DB,
        uuid,
        shopId,
        buyPrice ?? null,
        sellPrice ?? null,
        userId,
        isPTU,
      );
      if ("error" in result) return c.json({ error: result.error }, result.status);
      // Purge the cached detail so the new price surfaces immediately.
      c.executionCtx.waitUntil(
        purgeByPrefix(c.env.SC_BRIDGE_CACHE, `loot:detail:${cacheSlug(uuid)}`).catch((err) =>
          console.error("report-price cache purge failed", err),
        ),
      );
      return c.json({ ok: true });
    },
  );

  // GET /api/loot/:uuid — full detail + location data (public)
  // Must be last to avoid matching /collection and /wishlist
  app.get("/:uuid", async (c) => {
    const uuid = c.req.param("uuid");
    if (uuid.length > 50) return c.json({ error: "Not found" }, 404);
    const channel = getActiveChannel(c);
    const isPTU = isPTUChannel(channel);
    return cachedJson(
      c,
      `loot:detail:${cacheSlug(uuid)}:${channel.toLowerCase()}`,
      () => getLootByUuid(c.env.DB, uuid, isPTU),
    );
  });

  return app;
}
