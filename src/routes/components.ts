import { Hono } from "hono";
import type { HonoEnv } from "../lib/types";
import { PORT_TYPE_TO_COMPONENT_TYPE, STAT_SORT_KEY } from "../lib/constants";
import { cachedJson } from "../lib/cache";
import { renderCols, renderJoin, withRender, type RenderCols } from "../lib/renders";

// Valid URL slugs → port_type keys used in PORT_TYPE_TO_COMPONENT_TYPE
const VALID_TYPES = new Set([
  "weapon", "shield", "cooler", "power", "quantum_drive",
  "sensor", "turret", "missile", "mining_laser", "salvage_head", "qed",
]);

/**
 * /api/components/:type — Public reference data for all ship components by type.
 * No auth required. KV-cached per type.
 *
 * Columns live on `vehicle_components` (base) + per-type satellite tables
 * (component_powerplants, component_coolers, component_shields,
 * component_quantum_drives, component_weapons, component_radar, component_qed,
 * component_missiles). Mirrors the JOIN pattern in src/routes/loadout.ts.
 */
export function componentRoutes() {
  const app = new Hono<HonoEnv>();

  app.get("/:type", async (c) => {
    const type = c.req.param("type");
    if (!VALID_TYPES.has(type)) {
      return c.json({ error: `Invalid component type. Valid: ${[...VALID_TYPES].join(", ")}` }, 400);
    }

    const db = c.env.DB;

    return cachedJson(c, `components:${type}`, async () => {
      const componentTypes = PORT_TYPE_TO_COMPONENT_TYPE[type] || [type];
      const typePlaceholders = componentTypes.map(() => "?").join(",");
      // STAT_SORT_KEY already uses correct sub-table aliases (cp., cw., etc.).
      const sortKey = componentTypes.map(t => STAT_SORT_KEY[t]).find(Boolean) || "vc.name";

      const rows = await db
        .prepare(
          `SELECT vc.id, vc.uuid, vc.name, vc.slug, vc.class_name, vc.type, vc.sub_type,
                  vc.size, vc.grade, vc.class,
                  cp.power_output, cp.overpower_performance, cp.overclock_performance,
                  vc.thermal_output, cc.cooling_rate, cc.max_temperature,
                  cs.shield_hp, cs.shield_regen, cs.resist_physical, cs.resist_energy,
                  cs.resist_distortion, cs.resist_thermal, cs.regen_delay, cs.downed_regen_delay,
                  cq.quantum_speed, cq.quantum_range, cq.fuel_rate, cq.spool_time,
                  cq.cooldown_time, cq.stage1_accel, cq.stage2_accel,
                  cw.rounds_per_minute, cw.ammo_container_size, cw.damage_per_shot,
                  cw.damage_type, cw.projectile_speed, cw.effective_range, cw.dps,
                  cw.damage_physical, cw.damage_energy, cw.damage_distortion, cw.damage_thermal,
                  cw.heat_per_shot, vc.power_draw, vc.power_draw_min, cw.fire_modes,
                  cr.radar_range, cr.radar_angle,
                  ce.qed_range, ce.qed_strength,
                  cm.ammo_count, cm.missile_type,
                  vc.em_signature, vc.mass, vc.hp, cc.overheat_temperature,
                  vc.base_heat_generation, vc.distortion_max,
                  m.name AS manufacturer_name, m.code AS manufacturer_code,
                  ${renderCols("r")}, r.kind AS render_variants_kind, r.item_key AS render_item_key
           FROM vehicle_components vc
           LEFT JOIN manufacturers m ON m.id = vc.manufacturer_id
           LEFT JOIN component_powerplants cp ON cp.component_id = vc.id
           LEFT JOIN component_coolers cc ON cc.component_id = vc.id
           LEFT JOIN component_shields cs ON cs.component_id = vc.id
           LEFT JOIN component_quantum_drives cq ON cq.component_id = vc.id
           LEFT JOIN component_weapons cw ON cw.component_id = vc.id
           LEFT JOIN component_radar cr ON cr.component_id = vc.id
           LEFT JOIN component_qed ce ON ce.component_id = vc.id
           LEFT JOIN component_missiles cm ON cm.component_id = vc.id
           ${renderJoin("r", "vc.class_name")}
           WHERE vc.type IN (${typePlaceholders})
             AND vc.name NOT LIKE '%Template%'
           ORDER BY ${sortKey} DESC NULLS LAST, vc.name`,
        )
        .bind(...componentTypes)
        .all<RenderCols>();

      return { type, components: rows.results.map(withRender) };
    });
  });

  return app;
}
