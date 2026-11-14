import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { cachedJson, cacheSlug } from "../lib/cache";
import { getActiveChannel, isPTUChannel, resolveTable } from "../lib/ptu";

/** One structural hull part, as the tools pipeline writes it to vehicles.hull_parts_json. */
export interface HullPart {
  name: string;
  hp: number;
  parent: string | null;
  vital: boolean;
}

/**
 * vehicles.hull_parts_json → parts array, or null when the column is empty or
 * unreadable. A bad value drops the breakdown instead of failing the page.
 */
export function parseHullParts(raw: unknown): HullPart[] | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HullPart[]) : null;
  } catch {
    return null;
  }
}

/**
 * /api/ships/* — Ship reference database (all vehicles in the game)
 *
 * Channel-aware: when the active channel is PTU/EPTU, queries route to the
 * `ptu_vehicles` + `ptu_manufacturers` shadow tables instead of LIVE.
 * `production_statuses` is reference data (not patch-versioned) and stays
 * on the base table for both channels.
 */
export function vehicleRoutes<E extends HonoEnv>() {
  const routes = new Hono<E>();

  // GET /api/ships — list all player-relevant vehicles
  // Query params:
  //   ?pledgeable=1   — only ships currently available on the RSI pledge store
  //                    (excludes in-game-only variants like PYAM Exec, Best In
  //                     Show editions, mission-reward variants, etc.)
  //   ?include_npc=1  — include NPC-only variants (Vanduul Mauler, AI patrol
  //                    spawns, defendship variants). Default hides them.
  //
  // NPC vs not-pledgeable distinction (per migration 0221):
  //   • is_pledgeable=1: ships listed on the RSI store right now.
  //   • is_npc_only=1:  AI/spawn variants with no player-obtainable path.
  //   Examples that are is_pledgeable=0 BUT is_npc_only=0 (so still shown):
  //     - Drake Command Module (detachable from Caterpillar/Ironclad)
  //     - Krig L-22 Wikelo War Special (mission reward)
  //     - Best In Show / PYAM Exec variants
  routes.get("/", async (c) => {
    const db = c.env.DB;
    const pledgeableOnly = c.req.query("pledgeable") === "1";
    const includeNpc = c.req.query("include_npc") === "1";
    const isPTU = isPTUChannel(getActiveChannel(c));
    const vehiclesT = resolveTable("vehicles", isPTU);
    const manufacturersT = resolveTable("manufacturers", isPTU);
    const cacheKey = `ships:list${pledgeableOnly ? ":pledgeable" : ""}${includeNpc ? ":all" : ""}`;
    return cachedJson(c, cacheKey, async () => {
      const whereClauses = ["v.is_paint_variant = 0", "v.removed = 0"];
      if (pledgeableOnly) whereClauses.push("v.is_pledgeable = 1");
      if (!includeNpc) whereClauses.push("v.is_npc_only = 0");
      const result = await db
        .prepare(
          `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
            v.size, v.size_label, v.focus, v.classification, v.description,
            v.length, v.beam, v.height, v.mass, v.cargo,
            v.crew_min, v.crew_max, v.speed_scm, v.pledge_price, v.on_sale,
            v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
            v.pledge_url, v.price_auec, v.acquisition_type, v.acquisition_source_name,
            v.is_pledgeable,
            m.name as manufacturer_name, m.code as manufacturer_code,
            CASE WHEN v.parent_vehicle_id IS NOT NULL AND pps.key IS NOT NULL
              THEN pps.key ELSE ps.key END as production_status
          FROM ${vehiclesT} v
          LEFT JOIN ${manufacturersT} m ON m.id = v.manufacturer_id
          LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
          LEFT JOIN ${vehiclesT} pv ON pv.id = v.parent_vehicle_id
          LEFT JOIN production_statuses pps ON pps.id = pv.production_status_id
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY v.name`,
        )
        .all();
      return result.results;
    });
  });

  // GET /api/ships/:slug — get single vehicle by slug
  routes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const db = c.env.DB;
    const isPTU = isPTUChannel(getActiveChannel(c));
    const vehiclesT = resolveTable("vehicles", isPTU);
    const manufacturersT = resolveTable("manufacturers", isPTU);
    return cachedJson(c, `ships:detail:${cacheSlug(slug)}`, async () => {
      const vehicle = await db
        .prepare(
          `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
            v.size, v.size_label, v.focus, v.classification, v.description,
            v.length, v.beam, v.height, v.mass, v.cargo,
            v.external_cargo_scu, v.fuel_cargo_scu,
            v.personal_grid_microscu, v.locker_count,
            v.crew_min, v.crew_max, v.speed_scm, v.speed_max, v.hull_hp, v.hull_damage_normalization,
            v.hull_hp_total, v.hull_parts_json,
            v.vehicle_inventory, v.pledge_price, v.on_sale,
            v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
            v.pledge_url, v.price_auec, v.acquisition_type, v.acquisition_source_name,
            v.is_pledgeable,
            v.boost_speed_back, v.angular_velocity_pitch, v.angular_velocity_yaw,
            v.angular_velocity_roll, v.fuel_capacity_hydrogen, v.fuel_capacity_quantum,
            v.thruster_count_main, v.thruster_count_maneuvering,
            v.armor_hp, v.armor_damage_physical, v.armor_damage_energy,
            v.armor_damage_distortion, v.armor_damage_thermal,
            v.armor_deflection_physical, v.armor_deflection_energy,
            v.armor_signal_ir, v.armor_signal_em, v.armor_signal_cs,
            v.weapon_pool_size, v.shield_pool_max,
            v.cross_section_x, v.cross_section_y, v.cross_section_z,
            v.ir_signature, v.em_signature,
            v.claim_time, v.expedited_claim_time, v.expedited_claim_cost,
            m.name as manufacturer_name, m.code as manufacturer_code,
            CASE WHEN v.parent_vehicle_id IS NOT NULL AND pps.key IS NOT NULL
              THEN pps.key ELSE ps.key END as production_status
          FROM ${vehiclesT} v
          LEFT JOIN ${manufacturersT} m ON m.id = v.manufacturer_id
          LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
          LEFT JOIN ${vehiclesT} pv ON pv.id = v.parent_vehicle_id
          LEFT JOIN production_statuses pps ON pps.id = pv.production_status_id
          WHERE (v.slug = ? OR v.short_slug = ?) AND v.is_paint_variant = 0
          ORDER BY CASE WHEN v.slug = ? THEN 0 ELSE 1 END
          LIMIT 1`,
        )
        .bind(slug, slug, slug)
        .first<Record<string, unknown>>();
      if (!vehicle) return vehicle;
      const { hull_parts_json, ...rest } = vehicle;
      return { ...rest, hull_parts: parseHullParts(hull_parts_json) };
    });
  });

  return routes;
}
