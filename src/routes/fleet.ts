import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate, IntIdParam, OrgVisibility } from "../lib/validation";
import { purgePublicFleetCache, resolveVerifiedHandle } from "../lib/publicFleet";

/**
 * /api/vehicles/* — User's fleet
 */
export function fleetRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/vehicles — list user fleet with full reference data
  routes.get("/", async (c) => {
    return getFleetList(c.env.DB, getAuthUser(c).id, c);
  });

  // GET /api/vehicles/with-insurance — alias (insurance is already part of fleet data)
  routes.get("/with-insurance", async (c) => {
    return getFleetList(c.env.DB, getAuthUser(c).id, c);
  });

  // GET /api/vehicles/loaners — loaner ships the user is entitled to, derived
  // from their owned UNRELEASED (concept / in-production) ships via the
  // vehicle_loaners matrix. Not stored fleet rows — computed on read.
  routes.get("/loaners", async (c) => {
    return getFleetLoaners(c.env.DB, getAuthUser(c).id, c);
  });

  // PATCH /api/vehicles/bulk-visibility — set visibility on many ships in one call.
  // Two modes:
  //   { mode: "all", org_visibility }         → UPDATE every ship in caller's fleet
  //   { mode: "entries", entries: [{id, ov}] } → per-id batch, scoped to caller's ships
  // Single KV cache purge fires after the writes via waitUntil.
  routes.patch("/bulk-visibility",
    validate("json", z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("all"),
        org_visibility: OrgVisibility,
      }),
      z.object({
        mode: z.literal("entries"),
        entries: z
          .array(z.object({
            id: z.number().int().positive(),
            org_visibility: OrgVisibility,
          }))
          .min(1, "entries cannot be empty")
          .max(500, "entries cannot exceed 500 items"),
      }),
    ])),
    async (c) => {
      const db = c.env.DB;
      const userID = getAuthUser(c).id;
      const body = c.req.valid("json");

      let updated = 0;
      if (body.mode === "all") {
        const result = await db
          .prepare(`UPDATE user_fleet SET org_visibility = ? WHERE user_id = ?`)
          .bind(body.org_visibility, userID)
          .run();
        updated = result.meta.changes ?? 0;
      } else {
        // entries — batch the per-id updates. Each statement scopes by user_id
        // so foreign ids are silently no-ops (consistent with the single-row
        // visibility PATCH which 404s on foreign ids; for bulk we just count).
        const stmt = db.prepare(
          `UPDATE user_fleet SET org_visibility = ? WHERE id = ? AND user_id = ?`,
        );
        const batch = body.entries.map((e) =>
          stmt.bind(e.org_visibility, e.id, userID),
        );
        const results = await db.batch(batch);
        updated = results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);
      }

      // Single KV purge for the whole bulk op — same waitUntil pattern as the
      // per-ship PATCH so transient KV errors don't fail the user's write.
      const handle = await resolveVerifiedHandle(db, userID);
      c.executionCtx.waitUntil(
        purgePublicFleetCache(c.env.SC_BRIDGE_CACHE, handle)
          .catch((err) => console.error("[fleet/bulk-visibility] KV purge failed (non-fatal):", err)),
      );

      return c.json({ ok: true, updated });
    },
  );

  // PATCH /api/vehicles/:id/visibility — update org_visibility and/or available_for_ops
  routes.patch("/:id/visibility",
    validate("param", IntIdParam),
    validate("json", z.object({
      org_visibility: OrgVisibility.optional(),
      available_for_ops: z.boolean().optional(),
    }).refine((d) => d.org_visibility !== undefined || d.available_for_ops !== undefined, {
      message: "No fields to update",
    })),
    async (c) => {
    const { id } = c.req.valid("param");
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = c.req.valid("json");

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.org_visibility !== undefined) {
      updates.push("org_visibility = ?");
      values.push(body.org_visibility);
    }

    if (body.available_for_ops !== undefined) {
      updates.push("available_for_ops = ?");
      values.push(body.available_for_ops ? 1 : 0);
    }

    values.push(userID, id);

    const result = await db
      .prepare(`UPDATE user_fleet SET ${updates.join(", ")} WHERE user_id = ? AND id = ?`)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "Not found or not authorized" }, 404);
    }

    // Bust public-fleet KV cache so the shareable link reflects the change.
    // Resolves handle from either manual or extension verification path.
    const handle = await resolveVerifiedHandle(db, userID);
    c.executionCtx.waitUntil(
      purgePublicFleetCache(c.env.SC_BRIDGE_CACHE, handle)
        .catch((err) => console.error("[fleet/visibility] KV purge failed (non-fatal):", err)),
    );

    return c.json({ ok: true });
  });

  // PATCH /api/vehicles/:id/paint — equip a paint on this fleet entry (or null to unset)
  //
  // Validation:
  //   • paint_id null → unset (always allowed)
  //   • paint_id non-null → paint must exist, be linked to this vehicle via
  //     paint_vehicles, AND user must own it (user_paints row). The own-gate
  //     keeps the UX honest: you only see what you've actually pledged for.
  routes.patch("/:id/paint",
    validate("param", IntIdParam),
    validate("json", z.object({
      paint_id: z.number().int().positive().nullable(),
    })),
    async (c) => {
      const { id } = c.req.valid("param");
      const db = c.env.DB;
      const userID = getAuthUser(c).id;
      const { paint_id } = c.req.valid("json");

      // Confirm the fleet entry belongs to the user; capture vehicle_id for FK check.
      const fleetEntry = await db
        .prepare("SELECT id, vehicle_id FROM user_fleet WHERE id = ? AND user_id = ?")
        .bind(id, userID)
        .first<{ id: number; vehicle_id: number }>();

      if (!fleetEntry) {
        return c.json({ error: "Fleet entry not found" }, 404);
      }

      if (paint_id !== null) {
        // Paint must be linked to this vehicle.
        const link = await db
          .prepare(
            "SELECT 1 FROM paint_vehicles WHERE paint_id = ? AND vehicle_id = ?",
          )
          .bind(paint_id, fleetEntry.vehicle_id)
          .first();
        if (!link) {
          return c.json(
            { error: "Paint is not compatible with this vehicle" },
            400,
          );
        }

        // User must own the paint.
        const owned = await db
          .prepare("SELECT 1 FROM user_paints WHERE user_id = ? AND paint_id = ?")
          .bind(userID, paint_id)
          .first();
        if (!owned) {
          return c.json({ error: "You do not own this paint" }, 403);
        }
      }

      await db
        .prepare("UPDATE user_fleet SET equipped_paint_id = ? WHERE user_id = ? AND id = ?")
        .bind(paint_id, userID, id)
        .run();

      return c.json({ ok: true });
    },
  );

  // GET /api/vehicles/:id/upgrades — get CCU chain for a fleet entry
  routes.get("/:id/upgrades",
    validate("param", IntIdParam),
    async (c) => {
    const { id } = c.req.valid("param");
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    // Get the fleet entry's pledge_id
    const fleetEntry = await db
      .prepare("SELECT pledge_id FROM user_fleet WHERE id = ? AND user_id = ?")
      .bind(id, userID)
      .first<{ pledge_id: string | null }>();

    if (!fleetEntry?.pledge_id) {
      return c.json({ pledge: null, upgrades: [] });
    }

    const rsiPledgeId = parseInt(fleetEntry.pledge_id, 10);
    if (isNaN(rsiPledgeId)) {
      return c.json({ pledge: null, upgrades: [] });
    }

    // Get the pledge
    const pledge = await db
      .prepare(
        `SELECT id, rsi_pledge_id, name, value, value_cents, pledge_date, pledge_date_parsed,
          is_upgraded, currency, availability
        FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?`,
      )
      .bind(userID, rsiPledgeId)
      .first();

    if (!pledge) {
      return c.json({ pledge: null, upgrades: [] });
    }

    // Get the upgrade chain, ordered by sort_order
    const upgrades = await db
      .prepare(
        `SELECT upgrade_name, applied_at, applied_at_parsed, new_value, new_value_cents, sort_order
        FROM user_pledge_upgrades
        WHERE user_pledge_id = ?
        ORDER BY sort_order ASC`,
      )
      .bind(pledge.id)
      .all();

    return c.json({
      pledge,
      upgrades: upgrades.results,
    });
  });

  return routes;
}

async function getFleetList(
  db: D1Database,
  userID: string,
  c: { json: (data: unknown, status?: number) => Response },
) {
  const result = await db
    .prepare(
      `SELECT uf.id, uf.user_id, uf.vehicle_id, uf.insurance_type_id, uf.warbond, uf.is_loaner,
        uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
        uf.equipped_paint_id, uf.imported_at, uf.org_visibility, uf.available_for_ops,
        COALESCE(rv.name, v.name) as vehicle_name,
        COALESCE(rv.slug, v.slug) as vehicle_slug,
        COALESCE(rv.image_url, v.image_url) as image_url,
        COALESCE(rv.focus, v.focus) as focus,
        COALESCE(rv.size_label, v.size_label) as size_label,
        COALESCE(rv.cargo, v.cargo) as cargo,
        COALESCE(rv.crew_min, v.crew_min) as crew_min,
        COALESCE(rv.crew_max, v.crew_max) as crew_max,
        COALESCE(rv.pledge_price, v.pledge_price) as pledge_price,
        COALESCE(rv.speed_scm, v.speed_scm) as speed_scm,
        COALESCE(rv.classification, v.classification) as classification,
        v.claim_time, v.expedited_claim_time, v.expedited_claim_cost,
        COALESCE(rm.name, m.name) as manufacturer_name,
        COALESCE(rm.code, m.code) as manufacturer_code,
        it.label as insurance_label, it.duration_months, it.is_lifetime,
        p.name as paint_name,
        p.slug as paint_slug,
        p.image_url as paint_image_url,
        p.image_url_medium as paint_image_url_medium,
        p.image_url_small as paint_image_url_small,
        p.image_url_large as paint_image_url_large,
        COALESCE(rps.key, ps.key) as production_status,
        COALESCE(latest_upg.new_value_cents, up.value_cents) as current_value_cents,
        CASE WHEN v.replaced_by_vehicle_id IS NOT NULL THEN v.name END as original_vehicle_name
      FROM user_fleet uf
      JOIN vehicles v ON v.id = uf.vehicle_id
      LEFT JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN manufacturers rm ON rm.id = rv.manufacturer_id
      LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
      LEFT JOIN paints p ON p.id = uf.equipped_paint_id
      LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
      LEFT JOIN production_statuses rps ON rps.id = rv.production_status_id
      LEFT JOIN user_pledges up ON up.user_id = uf.user_id
        AND up.rsi_pledge_id = CAST(uf.pledge_id AS INTEGER)
      LEFT JOIN (
        SELECT user_pledge_id, new_value_cents
        FROM user_pledge_upgrades
        WHERE (user_pledge_id, sort_order) IN (
          SELECT user_pledge_id, MAX(sort_order) FROM user_pledge_upgrades GROUP BY user_pledge_id
        )
      ) latest_upg ON latest_upg.user_pledge_id = up.id
      WHERE uf.user_id = ?
      ORDER BY COALESCE(rv.name, v.name)`,
    )
    .bind(userID)
    .all();

  return c.json(result.results);
}

async function getFleetLoaners(
  db: D1Database,
  userID: string,
  c: { json: (data: unknown, status?: number) => Response },
) {
  // For each owned unreleased ship (concept / in-production, not an imported
  // loaner itself), expose the loaner ships it grants. Deduped by loaner ship,
  // with loaner_for listing the owned ship(s) that grant it. Loaner ships the
  // user already owns are excluded so nothing shows up twice.
  const result = await db
    .prepare(
      `SELECT l.id AS vehicle_id,
        l.name AS vehicle_name,
        l.slug AS vehicle_slug,
        l.image_url,
        l.focus,
        l.size_label,
        l.cargo,
        l.crew_min,
        l.crew_max,
        l.pledge_price,
        l.speed_scm,
        l.classification,
        m.name AS manufacturer_name,
        m.code AS manufacturer_code,
        ps.key AS production_status,
        1 AS is_derived_loaner,
        group_concat(DISTINCT owned.name) AS loaner_for
      FROM user_fleet uf
      JOIN vehicles owned ON owned.id = uf.vehicle_id
      JOIN production_statuses ops ON ops.id = owned.production_status_id
      JOIN vehicle_loaners vl ON vl.vehicle_id = owned.id
      JOIN vehicles l ON l.id = vl.loaner_id
      LEFT JOIN manufacturers m ON m.id = l.manufacturer_id
      LEFT JOIN production_statuses ps ON ps.id = l.production_status_id
      WHERE uf.user_id = ?1
        AND uf.is_loaner = 0
        AND ops.key != 'flight_ready'
        AND l.id NOT IN (SELECT vehicle_id FROM user_fleet WHERE user_id = ?1)
      GROUP BY l.id
      ORDER BY l.name`,
    )
    .bind(userID)
    .all();

  return c.json(result.results);
}
