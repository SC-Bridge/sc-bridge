// src/routes/weaponBuilds.ts
import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";

export function weaponBuildRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { results } = await db
      .prepare(
        `SELECT id, weapon_uuid, name, config_json, created_at, updated_at
         FROM user_weapon_builds WHERE user_id = ? ORDER BY updated_at DESC`,
      )
      .bind(userId)
      .all<{ id: number; weapon_uuid: string; name: string; config_json: string; created_at: string; updated_at: string }>();
    const items = results.map((r) => {
      const { config_json, ...rest } = r;
      let config: unknown = {};
      try { config = JSON.parse(config_json); } catch { config = {}; }
      return { ...rest, config };
    });
    return c.json({ items });
  });

  routes.post(
    "/",
    validate("json", z.object({
      weaponUuid: z.string().min(1).max(120),
      name: z.string().trim().min(1).max(100),
      config: z.record(z.string(), z.unknown()),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { weaponUuid, name, config } = c.req.valid("json");
      try {
        const row = await db
          .prepare(
            `INSERT INTO user_weapon_builds (user_id, weapon_uuid, name, config_json)
             VALUES (?, ?, ?, ?) RETURNING id`,
          )
          .bind(userId, weaponUuid, name, JSON.stringify(config))
          .first<{ id: number }>();
        return c.json({ ok: true, id: row?.id });
      } catch (e: unknown) {
        if (((e as Error)?.message || "").includes("UNIQUE")) {
          return c.json({ error: "A build with that name already exists for this weapon" }, 409);
        }
        throw e;
      }
    },
  );

  routes.patch(
    "/:id",
    validate("json", z.object({
      name: z.string().trim().min(1).max(100).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const id = parseInt(c.req.param("id"), 10);
      const body = c.req.valid("json");
      const owned = await db
        .prepare("SELECT id FROM user_weapon_builds WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first();
      if (!owned) return c.json({ error: "Not found" }, 404);

      const sets: string[] = [];
      const vals: unknown[] = [];
      if (body.name !== undefined) { sets.push("name = ?"); vals.push(body.name); }
      if (body.config !== undefined) { sets.push("config_json = ?"); vals.push(JSON.stringify(body.config)); }
      if (sets.length === 0) return c.json({ ok: true });
      sets.push("updated_at = datetime('now')");
      vals.push(id, userId);
      try {
        await db.prepare(`UPDATE user_weapon_builds SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
        return c.json({ ok: true });
      } catch (e: unknown) {
        if (((e as Error)?.message || "").includes("UNIQUE")) {
          return c.json({ error: "A build with that name already exists for this weapon" }, 409);
        }
        throw e;
      }
    },
  );

  routes.delete("/:id", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const id = parseInt(c.req.param("id"), 10);
    await db.prepare("DELETE FROM user_weapon_builds WHERE id = ? AND user_id = ?").bind(id, userId).run();
    return c.json({ ok: true });
  });

  return routes;
}
