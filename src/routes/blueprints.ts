import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";
import { ptuShadowExists } from "../lib/ptu";

/**
 * /api/blueprints/* — User-saved blueprints (owned / wishlist / crafting tracker)
 *
 * Identifier: blueprint_uuid (channel-stable across LIVE and PTU). The legacy
 * crafting_blueprint_id column is still populated for backwards compatibility
 * with the existing quality-sim save flow, but new flows key on uuid.
 */
export function blueprintRoutes() {
  const routes = new Hono<HonoEnv>();

  // ── GET / — list user's saved blueprints + builds ────────────────
  // Resolves blueprint metadata by uuid against BOTH the LIVE and PTU
  // tables so PTU-only blueprints (Banu Tachyoncannon, Wikelo variants)
  // still render with name/tag/type when the user marks them owned.
  //
  // Friendly product name resolution uses crafting_blueprints.output_item
  // (the cleaned class_name CIG ships in the BP record) joined to every
  // item table that could hold the localized in-game name:
  //   - fps_weapons     ("Novia Crossbow", "FS-9 LMG", ...)
  //   - fps_armour      ("Pembroke RG-46 Helmet", "Hardline AR2", ...)
  //   - fps_helmets     (helmet-specific item table)
  //   - fps_clothing    ("Bellator Jacket", "Spettro Shoes", ...)
  //   - fps_carryables  ("TH-01 Propulsor", "Probe", ...)
  //   - fps_ammo_types  (magazine names: "Novia Bolt Magazine")
  //   - vehicle_components (ship-mounted weapons + components)
  // Miss a table here and its blueprints silently fall back to the
  // machine-derived crafting_blueprints.name ("Hdtc Jacket 01 01 01").
  // Each gets a LIVE + PTU pair. First non-null wins via COALESCE.
  //
  // Builds (mig 0226) are nested under each blueprint as `builds[]`
  // — multiple named saved configs per BP per user.
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;

    // PTU shadow tables are DROPped by the PTU purge between cycles. Only join
    // them when present; otherwise every PTU alias collapses to NULL so this
    // LIVE query keeps working (it would 500 with "no such table" otherwise).
    const hasPtu = await ptuShadowExists(db);
    const p = (ref: string) => (hasPtu ? ref : "NULL");
    // class_name match target (PTU output_item folds to NULL when no PTU).
    const outItem = `LOWER(COALESCE(lcb.output_item, ${p("pcb.output_item")}))`;
    // pcb must join BEFORE the live fps joins — their ON clauses reference
    // pcb.output_item (via outItem); an ON clause can't reference a table to its
    // right. The item-name PTU joins are referenced only in SELECT, so they go
    // at the end.
    const ptuBpJoin = hasPtu
      ? `LEFT JOIN ptu_crafting_blueprints pcb ON pcb.uuid = ub.blueprint_uuid`
      : ``;
    const ptuItemJoins = hasPtu
      ? `LEFT JOIN ptu_fps_weapons  pfw ON LOWER(pfw.class_name) = ${outItem}
         LEFT JOIN ptu_fps_armour   pfa ON LOWER(pfa.class_name) = ${outItem}
         LEFT JOIN ptu_fps_helmets  pfh ON LOWER(pfh.class_name) = ${outItem}
         LEFT JOIN ptu_fps_clothing pfc ON LOWER(pfc.class_name) = ${outItem}
         LEFT JOIN ptu_fps_carryables pfy ON LOWER(pfy.class_name) = ${outItem}
         LEFT JOIN ptu_fps_ammo_types pam ON LOWER(pam.class_name) = ${outItem}
         LEFT JOIN ptu_vehicle_components pvc ON LOWER(pvc.class_name) = ${outItem}`
      : ``;

    const rows = await db
      .prepare(
        `SELECT ub.id, ub.crafting_blueprint_id, ub.blueprint_uuid,
                ub.is_owned, ub.is_wishlist,
                ub.nickname, ub.crafted_quantity,
                ub.quality_config_json, ub.source, ub.updated_at,
                COALESCE(lcb.name, ${p("pcb.name")}) AS blueprint_name,
                COALESCE(lcb.tag, ${p("pcb.tag")}) AS tag,
                COALESCE(lcb.type, ${p("pcb.type")}) AS type,
                COALESCE(lcb.sub_type, ${p("pcb.sub_type")}) AS sub_type,
                COALESCE(lcb.craft_time_seconds, ${p("pcb.craft_time_seconds")}) AS craft_time_seconds,
                COALESCE(lcb.output_item, ${p("pcb.output_item")}) AS output_item,
                COALESCE(lcb.id, ub.crafting_blueprint_id) AS resolved_blueprint_id,
                CASE WHEN lcb.id IS NULL AND ${p("pcb.id")} IS NOT NULL THEN 1 ELSE 0 END AS is_ptu_only,
                COALESCE(
                  lfw.name, ${p("pfw.name")},
                  lfa.name, ${p("pfa.name")},
                  lfh.name, ${p("pfh.name")},
                  lfc.name, ${p("pfc.name")},
                  lfy.name, ${p("pfy.name")},
                  lam.name, ${p("pam.name")},
                  lvc.name, ${p("pvc.name")}
                ) AS item_name
         FROM user_blueprints ub
         LEFT JOIN crafting_blueprints lcb ON lcb.uuid = ub.blueprint_uuid
         ${ptuBpJoin}
         LEFT JOIN fps_weapons      lfw ON LOWER(lfw.class_name) = ${outItem}
         LEFT JOIN fps_armour       lfa ON LOWER(lfa.class_name) = ${outItem}
         LEFT JOIN fps_helmets      lfh ON LOWER(lfh.class_name) = ${outItem}
         LEFT JOIN fps_clothing     lfc ON LOWER(lfc.class_name) = ${outItem}
         LEFT JOIN fps_carryables   lfy ON LOWER(lfy.class_name) = ${outItem}
         LEFT JOIN fps_ammo_types   lam ON LOWER(lam.class_name) = ${outItem}
         LEFT JOIN vehicle_components     lvc ON LOWER(lvc.class_name) = ${outItem}
         ${ptuItemJoins}
         WHERE ub.user_id = ?
         ORDER BY ub.updated_at DESC`,
      )
      .bind(userId)
      .all();

    // Fetch all builds for this user in a single query, group by uuid.
    const buildsResult = await db
      .prepare(
        `SELECT id, blueprint_uuid, name, quality_config_json,
                crafted_quantity, notes, created_at, updated_at
         FROM user_blueprint_builds
         WHERE user_id = ?
         ORDER BY blueprint_uuid, name ASC`,
      )
      .bind(userId)
      .all();
    const buildsByBp = new Map<string, Record<string, unknown>[]>();
    for (const row of buildsResult.results as Record<string, unknown>[]) {
      const uuid = row.blueprint_uuid as string;
      const built = {
        ...row,
        quality_config: row.quality_config_json
          ? JSON.parse(row.quality_config_json as string)
          : null,
        quality_config_json: undefined,
      };
      if (!buildsByBp.has(uuid)) buildsByBp.set(uuid, []);
      buildsByBp.get(uuid)!.push(built);
    }

    return c.json({
      items: rows.results.map((r) => {
        const builds = buildsByBp.get(r.blueprint_uuid as string) ?? [];
        return {
          ...r,
          is_owned: r.is_owned === 1,
          is_wishlist: r.is_wishlist === 1,
          is_ptu_only: r.is_ptu_only === 1,
          has_quality_config: builds.length > 0 || !!r.quality_config_json,
          builds,
          build_count: builds.length,
          crafting_blueprint_id: r.resolved_blueprint_id,
          quality_config: r.quality_config_json
            ? JSON.parse(r.quality_config_json as string)
            : null,
          quality_config_json: undefined,
          resolved_blueprint_id: undefined,
        };
      }),
    });
  });

  // ── PUT /state — toggle owned/wishlist by blueprint uuid ─────────
  // Sets absolute state. If both flags become false, the row is deleted
  // (no point keeping an empty marker). Resolves crafting_blueprint_id
  // for backwards compatibility with the quality-sim save flow.
  routes.put(
    "/state",
    validate(
      "json",
      z.object({
        blueprintUuid: z.string().uuid(),
        owned: z.boolean().optional(),
        wishlist: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { blueprintUuid, owned, wishlist } = c.req.valid("json");

      // Read current state so we can compute the new state when only
      // one flag is provided.
      const existing = await db
        .prepare(
          `SELECT id, is_owned, is_wishlist FROM user_blueprints
           WHERE user_id = ? AND blueprint_uuid = ?`,
        )
        .bind(userId, blueprintUuid)
        .first<{ id: number; is_owned: number; is_wishlist: number }>();

      const nextOwned = owned ?? (existing ? existing.is_owned === 1 : false);
      const nextWishlist =
        wishlist ?? (existing ? existing.is_wishlist === 1 : false);

      // Both flags off → delete the row ONLY if it's a bare marker. Keep it if
      // the user has attached any crafting work: crafted_quantity, a legacy
      // quality_config, OR — critically — saved builds. Builds live in the
      // separate user_blueprint_builds table (keyed by blueprint_uuid, FK to
      // user not user_blueprints), so deleting the parent row would orphan them
      // and they'd vanish from the saved list. (Data-loss bug: un-checking
      // Owned wiped saved builds.)
      if (!nextOwned && !nextWishlist) {
        const detail = existing
          ? await db
              .prepare(
                `SELECT crafted_quantity, quality_config_json
                 FROM user_blueprints WHERE id = ?`,
              )
              .bind(existing.id)
              .first<{
                crafted_quantity: number | null;
                quality_config_json: string | null;
              }>()
          : null;
        const builds = existing
          ? await db
              .prepare(
                `SELECT COUNT(*) AS n FROM user_blueprint_builds
                 WHERE user_id = ? AND blueprint_uuid = ?`,
              )
              .bind(userId, blueprintUuid)
              .first<{ n: number }>()
          : null;
        const hasWork =
          (detail?.crafted_quantity ?? 0) > 0 ||
          !!detail?.quality_config_json ||
          (builds?.n ?? 0) > 0;
        if (!hasWork && existing) {
          await db
            .prepare("DELETE FROM user_blueprints WHERE id = ?")
            .bind(existing.id)
            .run();
          return c.json({ ok: true, owned: false, wishlist: false });
        }
        // Otherwise just clear the flags — keep the row.
        await db
          .prepare(
            `UPDATE user_blueprints
             SET is_owned = 0, is_wishlist = 0, updated_at = datetime('now')
             WHERE user_id = ? AND blueprint_uuid = ?`,
          )
          .bind(userId, blueprintUuid)
          .run();
        return c.json({ ok: true, owned: false, wishlist: false });
      }

      // Resolve the legacy FK column from the active LIVE blueprint
      // table (PTU-only blueprints leave it NULL — uuid is the source
      // of truth either way).
      const bpRow = await db
        .prepare("SELECT id FROM crafting_blueprints WHERE uuid = ? LIMIT 1")
        .bind(blueprintUuid)
        .first<{ id: number }>();
      const legacyId = bpRow?.id ?? null;

      await db
        .prepare(
          `INSERT INTO user_blueprints
             (user_id, crafting_blueprint_id, blueprint_uuid,
              is_owned, is_wishlist, source, updated_at)
           VALUES (?, ?, ?, ?, ?, 'manual', datetime('now'))
           ON CONFLICT(user_id, blueprint_uuid) DO UPDATE SET
             is_owned = excluded.is_owned,
             is_wishlist = excluded.is_wishlist,
             crafting_blueprint_id =
               COALESCE(user_blueprints.crafting_blueprint_id, excluded.crafting_blueprint_id),
             updated_at = datetime('now')`,
        )
        .bind(
          userId,
          legacyId,
          blueprintUuid,
          nextOwned ? 1 : 0,
          nextWishlist ? 1 : 0,
        )
        .run();

      return c.json({ ok: true, owned: nextOwned, wishlist: nextWishlist });
    },
  );

  // ── POST / — save quality-sim config (uuid-keyed) ───────────────
  // Used by the quality simulator. Accepts blueprintUuid (preferred,
  // channel-stable) OR craftingBlueprintId (legacy fallback). Saving a
  // config implicitly marks the BP as owned. UPSERT collapses cleanly
  // even for PTU-only BPs whose LIVE FK is null.
  routes.post(
    "/",
    validate(
      "json",
      z
        .object({
          blueprintUuid: z.string().uuid().optional(),
          craftingBlueprintId: z.number().int().positive().optional(),
          nickname: z.string().max(100).nullable().optional(),
          qualityConfig: z
            .record(z.string(), z.number().int().min(0).max(1000))
            .nullable()
            .optional(),
        })
        .refine((v) => v.blueprintUuid || v.craftingBlueprintId, {
          message: "blueprintUuid or craftingBlueprintId required",
        }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { blueprintUuid, craftingBlueprintId, nickname, qualityConfig } =
        c.req.valid("json");

      const configJson = qualityConfig ? JSON.stringify(qualityConfig) : null;

      // Resolve uuid + LIVE id from whichever input was provided. We
      // accept the BP whether it lives in LIVE or PTU — the route
      // queries both tables.
      let resolvedUuid = blueprintUuid ?? null;
      let liveId: number | null = null;
      if (blueprintUuid) {
        const live = await db
          .prepare("SELECT id FROM crafting_blueprints WHERE uuid = ? LIMIT 1")
          .bind(blueprintUuid)
          .first<{ id: number }>();
        liveId = live?.id ?? null;
      } else if (craftingBlueprintId) {
        liveId = craftingBlueprintId;
        // Try LIVE first, then PTU shadow.
        const live = await db
          .prepare("SELECT uuid FROM crafting_blueprints WHERE id = ? LIMIT 1")
          .bind(craftingBlueprintId)
          .first<{ uuid: string }>();
        if (live?.uuid) {
          resolvedUuid = live.uuid;
        } else {
          const ptu = await db
            .prepare(
              "SELECT uuid FROM ptu_crafting_blueprints WHERE id = ? LIMIT 1",
            )
            .bind(craftingBlueprintId)
            .first<{ uuid: string }>()
            .catch(() => null); // PTU shadow table may be purged
          resolvedUuid = ptu?.uuid ?? null;
          // PTU id space differs — don't pin liveId to a PTU value.
          if (!live) liveId = null;
        }
      }

      if (!resolvedUuid) {
        return c.json({ error: "Blueprint not found" }, 404);
      }

      await db
        .prepare(
          `INSERT INTO user_blueprints
             (user_id, crafting_blueprint_id, blueprint_uuid,
              nickname, quality_config_json, is_owned, source, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'manual', datetime('now'))
           ON CONFLICT(user_id, blueprint_uuid) DO UPDATE SET
             nickname = excluded.nickname,
             quality_config_json = excluded.quality_config_json,
             crafting_blueprint_id =
               COALESCE(user_blueprints.crafting_blueprint_id, excluded.crafting_blueprint_id),
             is_owned = 1,
             updated_at = datetime('now')`,
        )
        .bind(userId, liveId, resolvedUuid, nickname ?? null, configJson)
        .run();

      return c.json({ ok: true, blueprintUuid: resolvedUuid });
    },
  );

  // ── PATCH /:id — update nickname or crafted quantity ────────────
  routes.patch(
    "/:id",
    validate(
      "json",
      z.object({
        nickname: z.string().max(100).nullable().optional(),
        craftedQuantity: z.number().int().min(0).optional(),
        qualityConfig: z
          .record(z.string(), z.number().int().min(0).max(1000))
          .nullable()
          .optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const id = parseInt(c.req.param("id"));
      const body = c.req.valid("json");

      const row = await db
        .prepare("SELECT id FROM user_blueprints WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first();
      if (!row) return c.json({ error: "Not found" }, 404);

      const sets: string[] = [];
      const vals: unknown[] = [];

      if (body.nickname !== undefined) {
        sets.push("nickname = ?");
        vals.push(body.nickname);
      }
      if (body.craftedQuantity !== undefined) {
        sets.push("crafted_quantity = ?");
        vals.push(body.craftedQuantity);
      }
      if (body.qualityConfig !== undefined) {
        sets.push("quality_config_json = ?");
        vals.push(
          body.qualityConfig ? JSON.stringify(body.qualityConfig) : null,
        );
      }

      if (sets.length === 0) return c.json({ ok: true });

      sets.push("updated_at = datetime('now')");
      vals.push(id, userId);

      await db
        .prepare(
          `UPDATE user_blueprints SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
        )
        .bind(...vals)
        .run();

      return c.json({ ok: true });
    },
  );

  // ── DELETE /:id — remove a saved blueprint ──────────────────────
  routes.delete("/:id", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const id = parseInt(c.req.param("id"));

    await db
      .prepare("DELETE FROM user_blueprints WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();

    return c.json({ ok: true });
  });

  // ── Builds — multiple named saved configs per blueprint ─────────
  // Each build is one CrafterBobsCustom-with-a-name entry. Saving from
  // the QualitySim creates or updates a build under the parent
  // blueprint_uuid. The first build implicitly marks the BP as owned
  // (saving a config means you're working with it).

  // POST /:uuid/builds — create a new build under a blueprint
  routes.post(
    "/:uuid/builds",
    validate(
      "json",
      z.object({
        name: z.string().min(1).max(100),
        qualityConfig: z.record(z.string(), z.number().int().min(0).max(1000)),
        notes: z.string().max(2000).nullable().optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const blueprintUuid = c.req.param("uuid");
      const { name, qualityConfig, notes } = c.req.valid("json");

      // Verify the blueprint exists in either channel. Check LIVE first; only
      // consult the PTU shadow table if LIVE misses. (A per-SELECT `LIMIT`
      // before `UNION ALL` is invalid SQLite and threw "LIMIT clause should
      // come after UNION ALL not before" → every build-save 500'd.) The PTU
      // shadow table is dropped in some environments during LIVE transitions,
      // so a missing-table error there is treated as "not in PTU".
      let exists = await db
        .prepare("SELECT 1 FROM crafting_blueprints WHERE uuid = ? LIMIT 1")
        .bind(blueprintUuid)
        .first();
      if (!exists) {
        exists = await db
          .prepare("SELECT 1 FROM ptu_crafting_blueprints WHERE uuid = ? LIMIT 1")
          .bind(blueprintUuid)
          .first()
          .catch(() => null);
      }
      if (!exists) return c.json({ error: "Blueprint not found" }, 404);

      // Auto-mark owned + ensure a parent user_blueprints row exists.
      const live = await db
        .prepare("SELECT id FROM crafting_blueprints WHERE uuid = ? LIMIT 1")
        .bind(blueprintUuid)
        .first<{ id: number }>();
      await db
        .prepare(
          `INSERT INTO user_blueprints
             (user_id, crafting_blueprint_id, blueprint_uuid,
              is_owned, source, updated_at)
           VALUES (?, ?, ?, 1, 'manual', datetime('now'))
           ON CONFLICT(user_id, blueprint_uuid) DO UPDATE SET
             is_owned = 1,
             updated_at = datetime('now')`,
        )
        .bind(userId, live?.id ?? null, blueprintUuid)
        .run();

      try {
        const result = await db
          .prepare(
            `INSERT INTO user_blueprint_builds
               (user_id, blueprint_uuid, name, quality_config_json, notes)
             VALUES (?, ?, ?, ?, ?)
             RETURNING id`,
          )
          .bind(
            userId,
            blueprintUuid,
            name.trim(),
            JSON.stringify(qualityConfig),
            notes ?? null,
          )
          .first<{ id: number }>();
        return c.json({ ok: true, id: result?.id });
      } catch (e: unknown) {
        const msg = (e as Error)?.message || "";
        if (msg.includes("UNIQUE")) {
          return c.json(
            { error: "A build with that name already exists for this blueprint" },
            409,
          );
        }
        throw e;
      }
    },
  );

  // PATCH /builds/:id — update a build
  routes.patch(
    "/builds/:id",
    validate(
      "json",
      z.object({
        name: z.string().min(1).max(100).optional(),
        qualityConfig: z.record(z.string(), z.number().int().min(0).max(1000)).optional(),
        craftedQuantity: z.number().int().min(0).optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const id = parseInt(c.req.param("id"));
      const body = c.req.valid("json");

      const row = await db
        .prepare(
          "SELECT id FROM user_blueprint_builds WHERE id = ? AND user_id = ?",
        )
        .bind(id, userId)
        .first();
      if (!row) return c.json({ error: "Not found" }, 404);

      const sets: string[] = [];
      const vals: unknown[] = [];
      if (body.name !== undefined) {
        sets.push("name = ?");
        vals.push(body.name.trim());
      }
      if (body.qualityConfig !== undefined) {
        sets.push("quality_config_json = ?");
        vals.push(JSON.stringify(body.qualityConfig));
      }
      if (body.craftedQuantity !== undefined) {
        sets.push("crafted_quantity = ?");
        vals.push(body.craftedQuantity);
      }
      if (body.notes !== undefined) {
        sets.push("notes = ?");
        vals.push(body.notes);
      }
      if (sets.length === 0) return c.json({ ok: true });

      sets.push("updated_at = datetime('now')");
      vals.push(id, userId);

      try {
        await db
          .prepare(
            `UPDATE user_blueprint_builds SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
          )
          .bind(...vals)
          .run();
        return c.json({ ok: true });
      } catch (e: unknown) {
        const msg = (e as Error)?.message || "";
        if (msg.includes("UNIQUE")) {
          return c.json(
            { error: "A build with that name already exists for this blueprint" },
            409,
          );
        }
        throw e;
      }
    },
  );

  // DELETE /builds/:id — remove a build
  routes.delete("/builds/:id", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const id = parseInt(c.req.param("id"));

    await db
      .prepare(
        "DELETE FROM user_blueprint_builds WHERE id = ? AND user_id = ?",
      )
      .bind(id, userId)
      .run();
    return c.json({ ok: true });
  });

  return routes;
}
