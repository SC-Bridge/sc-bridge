// src/routes/fpsLoadouts.ts
import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";

/** Known FPS loadout slot keys — mirrors the client-side slot layout. */
const FpsSlotKey = z.enum([
  "primary",
  "secondary",
  "sidearm",
  "helmet",
  "core",
  "arms",
  "legs",
  "backpack",
  "undersuit",
  "grenade_1",
  "grenade_2",
  "grenade_3",
  "grenade_4",
  "mag_1",
  "mag_2",
  "mag_3",
  "mag_4",
  "mag_5",
  "mag_6",
  "mag_7",
  "mag_8",
  "sling_1",
  "sling_2",
  "pen_1",
  "pen_2",
  "pen_3",
  "pen_4",
  "util_gadget",
  "util_knife",
]);

/** Route params for /:id/slots/:slotKey — loadout id + known slot key */
const SlotParams = z.object({
  id: z.coerce.number().int().positive({ message: "Invalid ID" }),
  slotKey: FpsSlotKey,
});

interface LoadoutSlotRow {
  loadout_id: number;
  name: string;
  slot_key: string | null;
  item_uuid: string | null;
  item_name: string | null;
  item_build_id: number | null;
  config_json: string | null;
  owned: number;
  wishlisted: number;
}

/**
 * /api/fps-loadouts — Named FPS loadouts (kits) + per-slot items (#200 follow-up).
 *
 * Owned/wishlisted are derived at read time from the user's Loot collection/wishlist
 * (user_loot_collection.loot_uuid / user_loot_wishlist.loot_uuid — both channel-stable
 * uuid columns, see migration 0225) joined against a slot's item_uuid.
 */
export function fpsLoadoutRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { results } = await db
      .prepare(
        `SELECT l.id AS loadout_id, l.name,
                s.slot_key, s.item_uuid, s.item_name, s.item_build_id, s.config_json,
                CASE WHEN ulc.id IS NOT NULL THEN 1 ELSE 0 END AS owned,
                CASE WHEN ulw.id IS NOT NULL THEN 1 ELSE 0 END AS wishlisted
         FROM user_fps_loadouts l
         LEFT JOIN user_fps_loadout_slots s ON s.loadout_id = l.id
         LEFT JOIN user_loot_collection ulc ON ulc.user_id = l.user_id AND ulc.loot_uuid = s.item_uuid
         LEFT JOIN user_loot_wishlist ulw ON ulw.user_id = l.user_id AND ulw.loot_uuid = s.item_uuid
         WHERE l.user_id = ?
         ORDER BY l.updated_at DESC, l.id, s.slot_key`,
      )
      .bind(userId)
      .all<LoadoutSlotRow>();

    const loadouts = new Map<number, { id: number; name: string; slots: Record<string, unknown>[] }>();
    for (const r of results) {
      if (!loadouts.has(r.loadout_id)) {
        loadouts.set(r.loadout_id, { id: r.loadout_id, name: r.name, slots: [] });
      }
      if (r.slot_key) {
        let config: unknown = null;
        if (r.config_json) {
          try { config = JSON.parse(r.config_json); } catch { config = null; }
        }
        loadouts.get(r.loadout_id)!.slots.push({
          slot_key: r.slot_key,
          item_uuid: r.item_uuid,
          item_name: r.item_name,
          item_build_id: r.item_build_id,
          config,
          owned: !!r.owned,
          wishlisted: !!r.wishlisted,
        });
      }
    }

    return c.json({ items: Array.from(loadouts.values()) });
  });

  routes.post(
    "/",
    validate("json", z.object({
      name: z.string().trim().min(1).max(80),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { name } = c.req.valid("json");
      try {
        const row = await db
          .prepare(`INSERT INTO user_fps_loadouts (user_id, name) VALUES (?, ?) RETURNING id`)
          .bind(userId, name)
          .first<{ id: number }>();
        return c.json({ ok: true, id: row?.id });
      } catch (e: unknown) {
        if (((e as Error)?.message || "").includes("UNIQUE")) {
          return c.json({ error: "A loadout with that name already exists" }, 409);
        }
        throw e;
      }
    },
  );

  // Duplicate a loadout (+ all its slots) under "Copy of <name>", suffixing
  // " (2)", " (3)"… to dodge the UNIQUE(user_id, name) constraint.
  routes.post(
    "/:id/duplicate",
    validate("param", z.object({ id: z.coerce.number().int().positive() })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { id } = c.req.valid("param");
      const src = await db
        .prepare("SELECT id, name FROM user_fps_loadouts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first<{ id: number; name: string }>();
      if (!src) return c.json({ error: "Not found" }, 404);

      // Matches POST / and PATCH /:id's z.max(80) — the suffix loop below
      // must keep the *final* name (base + " (N)") within that same cap, or
      // a rename via PATCH could reject a name this endpoint itself produced.
      const NAME_MAX = 80;
      const base = `Copy of ${src.name}`.slice(0, NAME_MAX);
      const { results } = await db
        .prepare("SELECT name FROM user_fps_loadouts WHERE user_id = ?")
        .bind(userId)
        .all<{ name: string }>();
      const taken = new Set(results.map((r) => r.name));
      let name = base;
      for (let i = 2; taken.has(name); i++) {
        const suffix = ` (${i})`;
        name = `${base.slice(0, NAME_MAX - suffix.length)}${suffix}`;
      }

      // Two statements, not one D1 batch: the slots INSERT...SELECT needs the
      // loadout id RETURNING produces from the first insert, and a batch's
      // statements are prepared up-front — there's no way to feed one
      // statement's result into the next within the same batch. Instead: the
      // taken-name scan above should already dodge the UNIQUE(user_id, name)
      // constraint, but a concurrent create/duplicate can still race it, so
      // the insert itself is guarded the same way POST / and PATCH /:id are
      // (409, not a raw 500). If the slots copy then fails, the loadout row
      // is compensated away (deleted) so a duplicate never leaves an
      // orphaned, slot-less loadout behind — the closest thing to atomicity
      // two non-transactional statements can offer.
      let created: { id: number } | null;
      try {
        created = await db
          .prepare("INSERT INTO user_fps_loadouts (user_id, name) VALUES (?, ?) RETURNING id")
          .bind(userId, name)
          .first<{ id: number }>();
      } catch (e: unknown) {
        if (((e as Error)?.message || "").includes("UNIQUE")) {
          return c.json({ error: "A loadout with that name already exists" }, 409);
        }
        throw e;
      }

      try {
        await db
          .prepare(
            `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, item_name, item_build_id, config_json)
             SELECT ?, slot_key, item_uuid, item_name, item_build_id, config_json
             FROM user_fps_loadout_slots WHERE loadout_id = ?`,
          )
          .bind(created!.id, src.id)
          .run();
      } catch (e: unknown) {
        await db.prepare("DELETE FROM user_fps_loadouts WHERE id = ?").bind(created!.id).run();
        throw e;
      }

      return c.json({ ok: true, id: created!.id, name });
    },
  );

  routes.patch(
    "/:id",
    validate("json", z.object({
      name: z.string().trim().min(1).max(80),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const id = parseInt(c.req.param("id"), 10);
      const { name } = c.req.valid("json");

      const owned = await db
        .prepare("SELECT id FROM user_fps_loadouts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first();
      if (!owned) return c.json({ error: "Not found" }, 404);

      try {
        await db
          .prepare("UPDATE user_fps_loadouts SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
          .bind(name, id, userId)
          .run();
        return c.json({ ok: true });
      } catch (e: unknown) {
        if (((e as Error)?.message || "").includes("UNIQUE")) {
          return c.json({ error: "A loadout with that name already exists" }, 409);
        }
        throw e;
      }
    },
  );

  routes.delete("/:id", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const id = parseInt(c.req.param("id"), 10);
    await db.prepare("DELETE FROM user_fps_loadouts WHERE id = ? AND user_id = ?").bind(id, userId).run();
    return c.json({ ok: true });
  });

  routes.put(
    "/:id/slots/:slotKey",
    validate("param", SlotParams),
    // nullable + optional: clients send explicit `itemBuildId: null` /
    // `config: null` for "no build / no config" — plain .optional() rejects
    // null ("expected number, received null"), which silently broke every
    // drag-to-loadout save.
    validate("json", z.object({
      itemUuid: z.string().trim().min(1).max(120).optional(),
      itemName: z.string().trim().min(1).max(200).optional(),
      itemBuildId: z.number().int().positive().nullable().optional(),
      config: z.record(z.string(), z.unknown()).nullable().optional(),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { id, slotKey } = c.req.valid("param");
      const body = c.req.valid("json");

      const loadoutOwned = await db
        .prepare("SELECT id FROM user_fps_loadouts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first();
      if (!loadoutOwned) return c.json({ error: "Not found" }, 404);

      if (body.itemBuildId != null) {
        const buildOwned = await db
          .prepare("SELECT id FROM user_item_builds WHERE id = ? AND user_id = ?")
          .bind(body.itemBuildId, userId)
          .first();
        if (!buildOwned) return c.json({ error: "item build not found" }, 404);
      }

      await db
        .prepare(
          `INSERT INTO user_fps_loadout_slots (loadout_id, slot_key, item_uuid, item_name, item_build_id, config_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(loadout_id, slot_key) DO UPDATE SET
             item_uuid = excluded.item_uuid,
             item_name = excluded.item_name,
             item_build_id = excluded.item_build_id,
             config_json = excluded.config_json,
             updated_at = datetime('now')`,
        )
        .bind(
          id,
          slotKey,
          body.itemUuid ?? null,
          body.itemName ?? null,
          body.itemBuildId ?? null,
          body.config != null ? JSON.stringify(body.config) : null,
        )
        .run();

      return c.json({ ok: true });
    },
  );

  routes.delete("/:id/slots/:slotKey", validate("param", SlotParams), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { id, slotKey } = c.req.valid("param");

    const loadoutOwned = await db
      .prepare("SELECT id FROM user_fps_loadouts WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .first();
    if (!loadoutOwned) return c.json({ error: "Not found" }, 404);

    await db
      .prepare("DELETE FROM user_fps_loadout_slots WHERE loadout_id = ? AND slot_key = ?")
      .bind(id, slotKey)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
