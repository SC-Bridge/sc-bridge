import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { getActiveChannel, isPTUChannel, resolveTable } from "../lib/ptu";
import { validate } from "../lib/validation";
import { PORT_TYPE_TO_COMPONENT_TYPE, STAT_SORT_KEY } from "../lib/constants";
import { cachedJson, cacheSlug } from "../lib/cache";
import { buyPriceSQL, buyablePricedSQL } from "../lib/pricing-sql";
import { getShipLoadout, getShipModules, getUserOwnedModuleTitles } from "../db/queries";

// D1 has a 100-parameter limit per prepared statement.
// Batch an IN-clause query into chunks, merging all results.
const BATCH_SIZE = 50;
async function batchInQuery<T>(
  db: D1Database,
  items: string[],
  buildQuery: (placeholders: string) => string,
  preBind: unknown[] = [],
): Promise<T[]> {
  if (items.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await db
      .prepare(buildQuery(placeholders))
      .bind(...preBind, ...chunk)
      .all();
    results.push(...(rows.results as T[]));
  }
  return results;
}

// --- Validation schemas ---

const LoadoutBody = z.object({
  overrides: z.array(z.object({
    port_id: z.number().int().positive(),
    component_id: z.number().int().positive(),
  })),
});

const CartAddBody = z.object({
  items: z.array(z.object({
    component_id: z.number().int().positive(),
    shop_id: z.number().int().positive().optional(),
    source_fleet_id: z.number().int().positive().optional(),
    quantity: z.number().int().min(1).default(1),
  })),
});

const CartUpdateBody = z.object({
  shop_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().min(1).optional(),
});

/**
 * /api/loadout/* — Ship loadout builder (public compatible components, auth-gated customization)
 */
export function loadoutRoutes() {
  const app = new Hono<HonoEnv>();

  // ============================================================
  //  PUBLIC — Compatible components for a ship port
  // ============================================================

  // GET /api/loadout/:slug/components — full loadout (stock) for any ship
  app.get("/:slug/components", async (c) => {
    const slug = c.req.param("slug");
    return cachedJson(c, `loadout:components:${cacheSlug(slug)}`, async () => {
      return getShipLoadout(c.env.DB, slug);
    });
  });

  // GET /api/loadout/:slug/modules — available modules for module ports
  app.get("/:slug/modules", async (c) => {
    const slug = c.req.param("slug");
    const isPTU = isPTUChannel(getActiveChannel(c));
    return cachedJson(c, `loadout:modules:${cacheSlug(slug)}`, async () => {
      return getShipModules(c.env.DB, slug, isPTU);
    });
  });

  // GET /api/loadout/:slug/modules/owned — user's owned module titles from pledges
  app.get("/:slug/modules/owned", async (c) => {
    try {
      const user = getAuthUser(c);
      const titles = await getUserOwnedModuleTitles(c.env.DB, user.id);
      return c.json(titles);
    } catch {
      return c.json([]);
    }
  });

  // GET /api/loadout/:slug/compatible?port_id=N&patch=X — all components fitting a port
  app.get("/:slug/compatible", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB;
    const portIdStr = c.req.query("port_id");

    if (!portIdStr) return c.json({ error: "port_id required" }, 400);
    const portId = parseInt(portIdStr, 10);
    if (isNaN(portId)) return c.json({ error: "port_id must be a number" }, 400);

    // Get port info (type + size range)
    const port = await db
      .prepare(`SELECT vp.port_type, COALESCE(vp.min_size, vp.size_min) as min_size, COALESCE(vp.max_size, vp.size_max) as max_size, vp.equipped_item_uuid
         FROM ${t("vehicle_ports")} vp
         WHERE vp.id = ?`,
      )
      .bind(portId)
      .first<{ port_type: string; min_size: number; max_size: number; equipped_item_uuid: string | null }>();

    if (!port) return c.json({ error: "Port not found" }, 404);

    // Map port_type → component types (port_type is lowercase, component types are PascalCase)
    // Some ports (turrets, weapons) have null port_type — infer from port name
    let resolvedPortType = port.port_type;
    if (!resolvedPortType) {
      const portInfo = await db
        .prepare(`SELECT COALESCE(port_name, name) as port_name FROM ${t("vehicle_ports")} WHERE id = ?`)
        .bind(portId)
        .first<{ port_name: string }>();
      const pn = (portInfo?.port_name || "").toLowerCase();
      if (pn.includes("turret")) resolvedPortType = "turret";
      else if (pn.includes("weapon") || pn.includes("gun")) resolvedPortType = "weapon";
      else if (pn.includes("missile")) resolvedPortType = "missile";
    }

    // Ports with size 0-0 are structural mounts (turret housings, fixed brackets)
    // that aren't player-swappable — return empty with explanation
    if (port.min_size === 0 && port.max_size === 0) {
      return c.json({
        port_id: portId,
        port_type: resolvedPortType,
        min_size: 0,
        max_size: 0,
        stock_uuid: port.equipped_item_uuid,
        components: [],
        note: "This is a fixed mount — swap components on the child weapon ports instead",
      });
    }

    // If the port has an equipped component, use its actual type to narrow compatible options.
    // This handles mining lasers (port_type='weapon' but component_type='WeaponMining') and
    // salvage heads (port_type='weapon' but component_type='SalvageModifier').
    // NOTE: We check the RESOLVED component (deepest child via loadout CTE), not the raw
    // equipped_item_uuid, because turret ports reference the housing, not the actual tool.
    let componentTypes = PORT_TYPE_TO_COMPONENT_TYPE[resolvedPortType] || [resolvedPortType || "UNKNOWN"];

    // Check both the direct equipped item AND the resolved deepest component
    const COMPONENT_TYPE_OVERRIDES: Record<string, string[]> = {
      WeaponMining: ["WeaponMining"],
      SalvageHead: ["SalvageHead"],
      SalvageModifier: ["SalvageModifier"],
      MiningModifier: ["MiningModifier"],
      TractorBeam: ["TractorBeam"],
      ToolArm: ["TractorBeam", "ToolArm"],
      UtilityTurret: [], // check children instead
    };

    // First try the port's own equipped item
    let resolvedComponentType: string | null = null;
    if (port.equipped_item_uuid) {
      const equipped = await db
        .prepare(`SELECT type FROM ${t("vehicle_components")} WHERE uuid = ?`)
        .bind(port.equipped_item_uuid)
        .first<{ type: string }>();
      resolvedComponentType = equipped?.type || null;
    }

    // If the direct item is a turret/housing, walk the port tree to find the deepest
    // child's component_type AND size range. The user is swapping the child, not the housing.
    const directComponentType = resolvedComponentType;
    let resolvedSizeMin = port.min_size;
    let resolvedSizeMax = port.max_size;
    if (!resolvedComponentType || resolvedComponentType === "UtilityTurret" || resolvedComponentType === "TurretBase" || resolvedComponentType === "Turret") {
      const loadoutRow = await db
        .prepare(`SELECT component_type, child_min_size, child_max_size FROM (${
          `SELECT
             CASE WHEN gccomp.type IS NOT NULL THEN gccomp.type
                  WHEN childcomp.type IS NOT NULL THEN childcomp.type
                  ELSE mount.type END as component_type,
             CASE WHEN grandchild.id IS NOT NULL THEN COALESCE(grandchild.min_size, grandchild.size_min)
                  WHEN child.id IS NOT NULL THEN COALESCE(child.min_size, child.size_min)
                  ELSE COALESCE(p.min_size, p.size_min) END as child_min_size,
             CASE WHEN grandchild.id IS NOT NULL THEN COALESCE(grandchild.max_size, grandchild.size_max)
                  WHEN child.id IS NOT NULL THEN COALESCE(child.max_size, child.size_max)
                  ELSE COALESCE(p.max_size, p.size_max) END as child_max_size
           FROM ${t("vehicle_ports")} p
           LEFT JOIN ${t("vehicle_components")} mount ON mount.uuid = p.equipped_item_uuid
           LEFT JOIN ${t("vehicle_ports")} child ON child.parent_port_id = p.id
           LEFT JOIN ${t("vehicle_components")} childcomp ON childcomp.uuid = child.equipped_item_uuid
           LEFT JOIN ${t("vehicle_ports")} grandchild ON grandchild.parent_port_id = child.id
           LEFT JOIN ${t("vehicle_components")} gccomp ON gccomp.uuid = grandchild.equipped_item_uuid
           WHERE p.id = ?
           ORDER BY CASE WHEN gccomp.type IS NOT NULL THEN 0 WHEN childcomp.type IS NOT NULL THEN 1 ELSE 2 END
           LIMIT 1`
        }) sub`)
        .bind(portId)
        .first<{ component_type: string; child_min_size: number; child_max_size: number }>();
      if (loadoutRow?.component_type) {
        resolvedComponentType = loadoutRow.component_type;
        // Use the child port's size range instead of the turret housing size
        if (loadoutRow.child_min_size != null) resolvedSizeMin = loadoutRow.child_min_size;
        if (loadoutRow.child_max_size != null) resolvedSizeMax = loadoutRow.child_max_size;
      }
    }

    if (resolvedComponentType && COMPONENT_TYPE_OVERRIDES[resolvedComponentType]) {
      const override = COMPONENT_TYPE_OVERRIDES[resolvedComponentType];
      if (override.length > 0) {
        componentTypes = override;
      }
    }
    const typePlaceholders = componentTypes.map(() => "?").join(",");

    // Find best sort key from the mapped types
    const sortKey = componentTypes.map(t => STAT_SORT_KEY[t]).find(Boolean) || "vc.name";

    // Fetch all compatible components (version-aware)
    const components = await db
      .prepare(`SELECT vc.id, vc.uuid, vc.name, vc.slug, vc.class_name, vc.type, vc.sub_type,
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
                m.name AS manufacturer_name, m.code AS manufacturer_code
         FROM ${t("vehicle_components")} vc
         LEFT JOIN ${t("manufacturers")} m ON m.id = vc.manufacturer_id
         LEFT JOIN ${t("component_powerplants")} cp ON cp.component_id = vc.id
         LEFT JOIN ${t("component_coolers")} cc ON cc.component_id = vc.id
         LEFT JOIN ${t("component_shields")} cs ON cs.component_id = vc.id
         LEFT JOIN ${t("component_quantum_drives")} cq ON cq.component_id = vc.id
         LEFT JOIN ${t("component_weapons")} cw ON cw.component_id = vc.id
         LEFT JOIN ${t("component_radar")} cr ON cr.component_id = vc.id
         LEFT JOIN ${t("component_qed")} ce ON ce.component_id = vc.id
         LEFT JOIN ${t("component_missiles")} cm ON cm.component_id = vc.id
         WHERE vc.type IN (${typePlaceholders})
           ${resolvedSizeMin === 0 && resolvedSizeMax === 0 ? "" : "AND vc.size BETWEEN ? AND ?"}
           AND vc.name NOT LIKE '%Template%'
           AND vc.name NOT LIKE '%PLACEHOLDER%'
         ORDER BY ${sortKey} DESC NULLS LAST, vc.name`,
      )
      .bind(...componentTypes, ...(resolvedSizeMin === 0 && resolvedSizeMax === 0 ? [] : [resolvedSizeMin, resolvedSizeMax]))
      .all();

    // Fetch shop availability via loot_map → loot_item_locations (source_type='shop')
    const classNames = components.results.map((c: any) => c.class_name).filter(Boolean);
    const componentUuids = components.results.map((c: any) => c.uuid).filter(Boolean);
    let shopMap: Record<string, Array<{ location_key: string; shop_name: string; location_label: string | null; buy_price: number | null }>> = {};

    if (classNames.length > 0) {
      // Three-layer shop model (migrations 0184-0185): terminal_inventory holds
      // item prices per terminal; terminals roll up to shops. Join lm.uuid →
      // terminal_inventory.item_uuid → terminals → shops.
      const shopRows = await batchInQuery<any>(
        db,
        classNames,
        (ph) =>
          `SELECT REPLACE(lm.class_name, 'EntityClassDefinition.', '') AS class_name,
                  t.shop_name_key AS location_key,
                  ROUND(${buyPriceSQL("ti")}) AS buy_price,
                  s.display_name AS shop_name, s.location_label
           FROM ${t("terminal_inventory")} ti
           JOIN ${t("loot_map")} lm ON lm.uuid = ti.item_uuid
           JOIN ${t("terminals")} t ON t.id = ti.terminal_id
           LEFT JOIN ${t("shops")} s ON s.id = t.shop_id
           WHERE ${buyablePricedSQL("ti")}
             AND REPLACE(lm.class_name, 'EntityClassDefinition.', '') IN (${ph})`,
      );

      for (const row of shopRows) {
        if (!shopMap[row.class_name]) shopMap[row.class_name] = [];
        shopMap[row.class_name].push({
          location_key: row.location_key,
          shop_name: row.shop_name || (row.location_key || '').replace(/^Inv_/, '').replace(/_/g, ' '),
          location_label: row.location_label,
          buy_price: row.buy_price,
        });
      }
    }

    // Check user collection + fleet cross-ref (auth optional)
    let collectionSet = new Set<string>();
    let fleetMap: Record<string, Array<{ fleet_id: number; ship_name: string; custom_name: string | null }>> = {};

    try {
      const user = getAuthUser(c);
      if (user?.id) {
        // Loot collection cross-ref via class_name
        const classNames = components.results.map((c: any) => c.class_name).filter(Boolean);
        if (classNames.length > 0) {
          const collRows = await batchInQuery<any>(
            db,
            classNames,
            (ph) =>
              `SELECT DISTINCT lm.class_name
               FROM user_loot_collection ulc
               JOIN ${t("loot_map")} lm ON lm.id = ulc.loot_item_id
               WHERE ulc.user_id = ? AND lm.class_name IN (${ph})`,
            [user.id],
          );
          for (const row of collRows) {
            collectionSet.add(row.class_name);
          }
        }

        // Fleet cross-ref: which of user's ships have these components equipped
        if (componentUuids.length > 0) {
          const fleetRows = await batchInQuery<any>(
            db,
            componentUuids,
            (ph) =>
              `SELECT vp.equipped_item_uuid, uf.id AS fleet_id,
                      uf.custom_name, v.name AS ship_name
               FROM user_fleet uf
               JOIN ${t("vehicles")} v ON v.id = uf.vehicle_id
               JOIN ${t("vehicle_ports")} vp ON vp.vehicle_id = v.id
               WHERE uf.user_id = ?
                 AND vp.equipped_item_uuid IN (${ph})`,
            [user.id],
          );
          for (const row of fleetRows) {
            if (!fleetMap[row.equipped_item_uuid]) fleetMap[row.equipped_item_uuid] = [];
            // Deduplicate by fleet_id
            if (!fleetMap[row.equipped_item_uuid].some((f: any) => f.fleet_id === row.fleet_id)) {
              fleetMap[row.equipped_item_uuid].push({
                fleet_id: row.fleet_id,
                ship_name: row.ship_name,
                custom_name: row.custom_name,
              });
            }
          }
        }
      }
    } catch {
      // Not authenticated — skip collection/fleet data
    }

    // Resolve the actual stock component UUID by walking the port tree.
    // For turret-housed weapons, port.equipped_item_uuid points to the housing (TurretBase),
    // not the actual weapon. Walk down: port → child → grandchild to find the deepest equipped UUID.
    // Only walk for turret/housing types — simple ports (QD, shield, etc.) have children that are
    // different component types (e.g. QD → JumpDrive sub-port) and must not be walked.
    let stockUuid = port.equipped_item_uuid;
    const isTurretHousing = !directComponentType || directComponentType === "UtilityTurret" || directComponentType === "TurretBase" || directComponentType === "Turret";
    if (stockUuid && isTurretHousing) {
      const deepest = await db
        .prepare(`SELECT COALESCE(grandchild.equipped_item_uuid, child.equipped_item_uuid, p.equipped_item_uuid) AS deep_uuid
           FROM ${t("vehicle_ports")} p
           LEFT JOIN ${t("vehicle_ports")} child ON child.parent_port_id = p.id
           LEFT JOIN ${t("vehicle_ports")} grandchild ON grandchild.parent_port_id = child.id
           WHERE p.id = ?
           ORDER BY CASE WHEN grandchild.equipped_item_uuid IS NOT NULL THEN 0
                         WHEN child.equipped_item_uuid IS NOT NULL THEN 1 ELSE 2 END
           LIMIT 1`,
        )
        .bind(portId)
        .first<{ deep_uuid: string | null }>();
      if (deepest?.deep_uuid) stockUuid = deepest.deep_uuid;
    }

    // Merge shop + collection + fleet data into components
    const enriched = components.results.map((comp: any) => ({
      ...comp,
      is_stock: comp.uuid === stockUuid,
      shops: shopMap[comp.class_name] || [],
      in_collection: collectionSet.has(comp.class_name),
      on_ships: fleetMap[comp.uuid] || [],
    }));

    return c.json({
      port_id: portId,
      port_type: port.port_type,
      min_size: resolvedSizeMin,
      max_size: resolvedSizeMax,
      stock_uuid: stockUuid,
      components: enriched,
    });
  });

  // ============================================================
  //  AUTH — Fleet loadout overrides
  // ============================================================

  // GET /api/loadout/fleet/:id — get custom loadout for a fleet ship
  app.get("/fleet/:id", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const user = getAuthUser(c);
    const fleetId = parseInt(c.req.param("id"), 10);
    if (isNaN(fleetId)) return c.json({ error: "Invalid fleet ID" }, 400);

    const overrides = await c.env.DB
      .prepare(`SELECT ufl.id, ufl.port_id, ufl.component_id,
                vc.name AS component_name, vc.name AS child_name,
                vc.uuid AS component_uuid, vc.class_name,
                vc.type, vc.sub_type, vc.size, vc.grade, vc.class,
                cp.power_output, cc.cooling_rate, cs.shield_hp, cs.shield_regen,
                cs.resist_physical, cs.resist_energy, cs.resist_distortion, cs.resist_thermal,
                cq.quantum_speed, cq.quantum_range, cq.fuel_rate, cq.spool_time,
                cw.dps, cw.damage_per_shot, cw.damage_type, cw.rounds_per_minute, cw.effective_range,
                cw.damage_physical, cw.damage_energy, cw.damage_distortion, cw.damage_thermal,
                cr.radar_range, vc.power_draw, vc.power_draw_min, vc.thermal_output,
                m.name AS manufacturer_name
         FROM user_fleet_loadout ufl
         JOIN ${t("vehicle_components")} vc ON vc.id = ufl.component_id
         LEFT JOIN ${t("manufacturers")} m ON m.id = vc.manufacturer_id
         LEFT JOIN ${t("component_powerplants")} cp ON cp.component_id = vc.id
         LEFT JOIN ${t("component_coolers")} cc ON cc.component_id = vc.id
         LEFT JOIN ${t("component_shields")} cs ON cs.component_id = vc.id
         LEFT JOIN ${t("component_quantum_drives")} cq ON cq.component_id = vc.id
         LEFT JOIN ${t("component_weapons")} cw ON cw.component_id = vc.id
         LEFT JOIN ${t("component_radar")} cr ON cr.component_id = vc.id
         WHERE ufl.user_id = ? AND ufl.user_fleet_id = ?`,
      )
      .bind(user.id, fleetId)
      .all<Record<string, unknown>>();

    // Attach shops (exact class_name only — same rule as getShipLoadout, no
    // name-variant fallback) so a saved swap carries its real buy locations
    // into the Location Planner instead of inheriting the stock component's
    // shops on the client-side merge (#94).
    const rows = overrides.results;
    const classNames = [
      ...new Set(rows.map((r) => (r.class_name as string | null) ?? "").filter(Boolean)),
    ];
    if (classNames.length > 0) {
      const ph = classNames.map(() => "?").join(",");
      const shopRows = await c.env.DB
        .prepare(
          `SELECT REPLACE(lm.class_name, 'EntityClassDefinition.', '') AS class_name,
                  tm.shop_name_key AS location_key,
                  ROUND(${buyPriceSQL("ti")}) AS buy_price,
                  s.display_name AS shop_name, s.location_label
             FROM terminal_inventory ti
             JOIN loot_map lm ON lm.uuid = ti.item_uuid
             JOIN terminals tm ON tm.id = ti.terminal_id
             LEFT JOIN shops s ON s.id = tm.shop_id
            WHERE ${buyablePricedSQL("ti")}
              AND REPLACE(lm.class_name, 'EntityClassDefinition.', '') IN (${ph})`,
        )
        .bind(...classNames)
        .all<{ class_name: string; location_key: string; buy_price: number | null; shop_name: string | null; location_label: string | null }>();
      const shopMap: Record<string, Array<Record<string, unknown>>> = {};
      for (const row of shopRows.results) {
        (shopMap[row.class_name] ??= []).push({
          location_key: row.location_key,
          shop_name: row.shop_name || (row.location_key || "").replace(/^Inv_/, "").replace(/_/g, " "),
          location_label: row.location_label,
          buy_price: row.buy_price,
        });
      }
      for (const r of rows) r.shops = shopMap[(r.class_name as string) ?? ""] || [];
    } else {
      for (const r of rows) r.shops = [];
    }

    return c.json({ overrides: rows });
  });

  // PUT /api/loadout/fleet/:id — save loadout overrides (bulk)
  app.put("/fleet/:id",
    validate("json", LoadoutBody),
    async (c) => {
      const user = getAuthUser(c);
      const fleetId = parseInt(c.req.param("id"), 10);
      if (isNaN(fleetId)) return c.json({ error: "Invalid fleet ID" }, 400);

      // Verify user owns this fleet entry
      const fleetEntry = await c.env.DB
        .prepare("SELECT id FROM user_fleet WHERE id = ? AND user_id = ?")
        .bind(fleetId, user.id)
        .first();
      if (!fleetEntry) return c.json({ error: "Fleet entry not found" }, 404);

      const { overrides } = c.req.valid("json");
      const db = c.env.DB;

      // Upsert each override
      const stmts = overrides.map((o) =>
        db
          .prepare(
            `INSERT INTO user_fleet_loadout (user_id, user_fleet_id, port_id, component_id, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT (user_id, user_fleet_id, port_id)
             DO UPDATE SET component_id = excluded.component_id, updated_at = datetime('now')`,
          )
          .bind(user.id, fleetId, o.port_id, o.component_id),
      );

      if (stmts.length > 0) {
        await db.batch(stmts);
      }

      return c.json({ ok: true });
    },
  );

  // DELETE /api/loadout/fleet/:id — reset entire ship to stock
  app.delete("/fleet/:id", async (c) => {
    const user = getAuthUser(c);
    const fleetId = parseInt(c.req.param("id"), 10);
    if (isNaN(fleetId)) return c.json({ error: "Invalid fleet ID" }, 400);

    await c.env.DB
      .prepare("DELETE FROM user_fleet_loadout WHERE user_id = ? AND user_fleet_id = ?")
      .bind(user.id, fleetId)
      .run();

    return c.json({ ok: true });
  });

  // DELETE /api/loadout/fleet/:id/port/:portId — reset single port to stock
  app.delete("/fleet/:id/port/:portId", async (c) => {
    const user = getAuthUser(c);
    const fleetId = parseInt(c.req.param("id"), 10);
    const portId = parseInt(c.req.param("portId"), 10);
    if (isNaN(fleetId) || isNaN(portId)) return c.json({ error: "Invalid IDs" }, 400);

    await c.env.DB
      .prepare("DELETE FROM user_fleet_loadout WHERE user_id = ? AND user_fleet_id = ? AND port_id = ?")
      .bind(user.id, fleetId, portId)
      .run();

    return c.json({ ok: true });
  });

  // ============================================================
  //  AUTH — Shopping cart
  // ============================================================

  // GET /api/loadout/cart — user's shopping cart
  app.get("/cart", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const user = getAuthUser(c);
    const rows = await c.env.DB
      .prepare(`SELECT ulc.id, ulc.component_id, ulc.shop_id, ulc.quantity, ulc.source_fleet_id,
                vc.name AS component_name, vc.uuid AS component_uuid, vc.class_name, vc.type, vc.size, vc.grade,
                m.name AS manufacturer_name,
                cheapest.shop_display_name AS shop_name,
                cheapest.location_label AS shop_location,
                cheapest.buy_price,
                uf.custom_name AS fleet_custom_name,
                v.name AS fleet_ship_name
         FROM user_loadout_cart ulc
         JOIN ${t("vehicle_components")} vc ON vc.id = ulc.component_id
         LEFT JOIN ${t("manufacturers")} m ON m.id = vc.manufacturer_id
         LEFT JOIN (
           SELECT REPLACE(lm.class_name, 'EntityClassDefinition.', '') AS class_name,
                  COALESCE(s.display_name, REPLACE(REPLACE(t.shop_name_key, 'Inv_', ''), '_', ' ')) AS shop_display_name,
                  s.location_label,
                  ROUND(${buyPriceSQL("ti")}) AS buy_price,
                  ROW_NUMBER() OVER (
                    PARTITION BY lm.class_name
                    ORDER BY ${buyPriceSQL("ti")} ASC
                  ) AS rn
           FROM ${t("terminal_inventory")} ti
           JOIN ${t("loot_map")} lm ON lm.uuid = ti.item_uuid
           JOIN ${t("terminals")} t ON t.id = ti.terminal_id
           LEFT JOIN ${t("shops")} s ON s.id = t.shop_id
           WHERE ${buyablePricedSQL("ti")}
         ) cheapest ON cheapest.class_name = vc.class_name AND cheapest.rn = 1
         LEFT JOIN user_fleet uf ON uf.id = ulc.source_fleet_id
         LEFT JOIN ${t("vehicles")} v ON v.id = uf.vehicle_id
         WHERE ulc.user_id = ?
         ORDER BY vc.type, vc.name`,
      )
      .bind(user.id)
      .all();

    return c.json({ items: rows.results });
  });

  // GET /api/loadout/cart/shops?class_name=X — all shops selling a component
  app.get("/cart/shops", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const className = c.req.query("class_name");
    if (!className) return c.json({ error: "class_name required" }, 400);

    const rows = await c.env.DB
      .prepare(`SELECT t.shop_name_key AS location_key,
                ROUND(${buyPriceSQL("ti")}) AS buy_price,
                COALESCE(s.display_name, REPLACE(REPLACE(t.shop_name_key, 'Inv_', ''), '_', ' ')) AS shop_name,
                s.location_label
         FROM ${t("terminal_inventory")} ti
         JOIN ${t("loot_map")} lm ON lm.uuid = ti.item_uuid
         JOIN ${t("terminals")} t ON t.id = ti.terminal_id
         LEFT JOIN ${t("shops")} s ON s.id = t.shop_id
         WHERE ${buyablePricedSQL("ti")}
           AND REPLACE(lm.class_name, 'EntityClassDefinition.', '') = ?
         ORDER BY ${buyPriceSQL("ti")} ASC`,
      )
      .bind(className)
      .all();

    return c.json({ shops: rows.results });
  });

  // POST /api/loadout/cart — add items to cart
  app.post("/cart",
    validate("json", CartAddBody),
    async (c) => {
      const user = getAuthUser(c);
      const { items } = c.req.valid("json");
      const db = c.env.DB;

      const stmts = items.map((item) =>
        db
          .prepare(
            `INSERT INTO user_loadout_cart (user_id, component_id, shop_id, source_fleet_id, quantity)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (user_id, component_id, source_fleet_id)
             DO UPDATE SET quantity = user_loadout_cart.quantity + excluded.quantity,
                           shop_id = COALESCE(excluded.shop_id, user_loadout_cart.shop_id)`,
          )
          .bind(user.id, item.component_id, item.shop_id ?? null, item.source_fleet_id ?? null, item.quantity),
      );

      if (stmts.length > 0) {
        await db.batch(stmts);
      }

      return c.json({ ok: true });
    },
  );

  // PUT /api/loadout/cart/:id — update cart item
  app.put("/cart/:id",
    validate("json", CartUpdateBody),
    async (c) => {
      const user = getAuthUser(c);
      const cartId = parseInt(c.req.param("id"), 10);
      if (isNaN(cartId)) return c.json({ error: "Invalid cart ID" }, 400);

      const body = c.req.valid("json");
      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.shop_id !== undefined) {
        updates.push("shop_id = ?");
        values.push(body.shop_id);
      }
      if (body.quantity !== undefined) {
        updates.push("quantity = ?");
        values.push(body.quantity);
      }

      if (updates.length === 0) return c.json({ error: "No fields to update" }, 400);

      values.push(cartId, user.id);
      await c.env.DB
        .prepare(`UPDATE user_loadout_cart SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`)
        .bind(...values)
        .run();

      return c.json({ ok: true });
    },
  );

  // DELETE /api/loadout/cart/:id — remove single cart item
  app.delete("/cart/:id", async (c) => {
    const user = getAuthUser(c);
    const cartId = parseInt(c.req.param("id"), 10);
    if (isNaN(cartId)) return c.json({ error: "Invalid cart ID" }, 400);

    await c.env.DB
      .prepare("DELETE FROM user_loadout_cart WHERE id = ? AND user_id = ?")
      .bind(cartId, user.id)
      .run();

    return c.json({ ok: true });
  });

  // DELETE /api/loadout/cart — empty entire cart
  app.delete("/cart", async (c) => {
    const user = getAuthUser(c);
    await c.env.DB
      .prepare("DELETE FROM user_loadout_cart WHERE user_id = ?")
      .bind(user.id)
      .run();

    return c.json({ ok: true });
  });

  // POST /api/loadout/cart/optimize — assign optimal shops (minimum shops algorithm)
  app.post("/cart/optimize", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const user = getAuthUser(c);
    const db = c.env.DB;

    // Get all cart items
    const cartItems = await db
      .prepare(`SELECT ulc.id, vc.uuid AS component_uuid
         FROM user_loadout_cart ulc
         JOIN ${t("vehicle_components")} vc ON vc.id = ulc.component_id
         WHERE ulc.user_id = ?`,
      )
      .bind(user.id)
      .all();

    if (cartItems.results.length === 0) return c.json({ ok: true, message: "Cart is empty" });

    // Get all shops that sell any cart item
    const uuids = cartItems.results.map((r: any) => r.component_uuid).filter(Boolean);

    const shopAvailRows = await batchInQuery<any>(
      db,
      uuids,
      (ph) =>
        `SELECT si.item_uuid, s.id AS shop_id
         FROM shop_inventory si
         JOIN ${t("shops")} s ON s.id = si.shop_id
         WHERE si.item_uuid IN (${ph})
           AND si.buy_price IS NOT NULL`,
    );
    const shopAvail = { results: shopAvailRows };

    // Build shop → items map
    const shopToItems: Record<number, Set<string>> = {};
    const itemToShops: Record<string, Set<number>> = {};
    for (const row of shopAvail.results as any[]) {
      if (!shopToItems[row.shop_id]) shopToItems[row.shop_id] = new Set();
      shopToItems[row.shop_id].add(row.item_uuid);
      if (!itemToShops[row.item_uuid]) itemToShops[row.item_uuid] = new Set();
      itemToShops[row.item_uuid].add(row.shop_id);
    }

    // Greedy set-cover: pick shop covering most uncovered items
    const uncovered = new Set(uuids);
    const assignments: Record<string, number | null> = {};

    while (uncovered.size > 0) {
      let bestShop: number | null = null;
      let bestCount = 0;

      for (const [shopIdStr, items] of Object.entries(shopToItems)) {
        const shopId = parseInt(shopIdStr, 10);
        let count = 0;
        for (const item of items) {
          if (uncovered.has(item)) count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestShop = shopId;
        }
      }

      if (bestShop === null) {
        // Remaining items have no shops — mark as loot-only
        for (const uuid of uncovered) {
          assignments[uuid] = null;
        }
        break;
      }

      // Assign this shop to all items it covers
      for (const item of shopToItems[bestShop]) {
        if (uncovered.has(item)) {
          assignments[item] = bestShop;
          uncovered.delete(item);
        }
      }
    }

    // Update cart items with assigned shops
    const updateStmts = cartItems.results.map((item: any) => {
      const shopId = assignments[item.component_uuid] ?? null;
      return db
        .prepare("UPDATE user_loadout_cart SET shop_id = ? WHERE id = ?")
        .bind(shopId, item.id);
    });

    if (updateStmts.length > 0) {
      await db.batch(updateStmts);
    }

    return c.json({ ok: true });
  });

  return app;
}
