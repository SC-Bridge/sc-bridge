import { Hono } from "hono"
import type { HonoEnv } from "../lib/types"
import { getActiveChannel, isPTUChannel, resolveTable } from "../lib/ptu";
import { cachedJson, cacheSlug } from "../lib/cache"
import { buyPriceSQL, sellPriceSQL } from "../lib/pricing-sql"
import { resolvePOISlug } from "../lib/poi"
import { getPOIDetail, getPOIChildren } from "../db/queries"

/** SQL expression for shop display name — populated by extraction scripts */
const SHOP_DISPLAY_NAME_EXPR = `COALESCE(s.display_name, REPLACE(REPLACE(REPLACE(s.name, 'Inv ', ''), '_', ' '), '  ', ' '))`

/** Build the inventory query for a set of shop IDs (channel-aware). */
function buildInventoryQuery(placeholders: string, isPTU: boolean): string {
  const t = (n: string) => resolveTable(n, isPTU);
  return `SELECT t.shop_id, ti.item_uuid, ti.item_name,
       ${buyPriceSQL("ti")} as buy_price,
       ${sellPriceSQL("ti")} as sell_price,
       ti.base_inventory, ti.max_inventory,
       COALESCE(fi.name, tc.name, v.name, ti.item_name) as resolved_name,
       CASE
         WHEN fi.id IS NOT NULL THEN 'gear'
         WHEN tc.id IS NOT NULL THEN 'commodity'
         WHEN v.id IS NOT NULL THEN 'vehicle'
         ELSE 'other'
       END as item_category
     FROM ${t("terminal_inventory")} ti
     JOIN ${t("terminals")} t ON t.id = ti.terminal_id
     LEFT JOIN ${t("loot_map")} fi ON fi.uuid = ti.item_uuid
     LEFT JOIN ${t("trade_commodities")} tc ON tc.uuid = ti.item_uuid
     LEFT JOIN ${t("vehicles")} v ON v.uuid = ti.item_uuid
     WHERE t.shop_id IN (${placeholders})
     ORDER BY COALESCE(fi.name, tc.name, v.name, ti.item_name)`
}

/** Nest inventory items under their shops with cleaned display names */
function nestInventoryUnderShops(
  shops: Record<string, unknown>[],
  inventory: Record<string, unknown>[],
): Record<string, unknown>[] {
  const inventoryByShop = new Map<number, Record<string, unknown>[]>()
  for (const item of inventory) {
    const shopId = item.shop_id as number
    if (!inventoryByShop.has(shopId)) inventoryByShop.set(shopId, [])
    inventoryByShop.get(shopId)!.push(item)
  }

  return shops.map((shop) => ({
    ...shop,
    displayName:
      (shop.name as string)
        .replace(/^Inv /, "")
        .replace(/_/g, " ")
        .replace(/  +/g, " ")
        .trim(),
    items: inventoryByShop.get(shop.id as number) ?? [],
  }))
}

/**
 * /api/gamedata — Public reference data for careers, reputation, law, mining, shops
 */
export function gamedataRoutes<E extends HonoEnv>() {
  const app = new Hono<E>()

  // GET /api/gamedata/careers — vehicle careers + roles with linked vehicles
  app.get("/careers", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:careers`, async () => {
      const [careersResult, rolesResult, careerAssignments, roleAssignments] = await Promise.all([
        db.prepare(`SELECT * FROM ${t("vehicle_careers")} WHERE name != '<= PLACEHOLDER =>' ORDER BY name`).all(),
        db.prepare(`SELECT * FROM ${t("vehicle_roles")} WHERE name != '<= PLACEHOLDER =>' AND name NOT LIKE '%Haymaker%' ORDER BY name`).all(),
        db.prepare(`
          SELECT vca.career_id, v.id, v.name, v.slug, v.image_url, m.name as manufacturer_name, v.size_label, v.focus, v.classification
          FROM vehicle_career_assignments vca
          JOIN ${t("vehicles")} v ON v.id = vca.vehicle_id
          LEFT JOIN ${t("manufacturers")} m ON m.id = v.manufacturer_id
          ORDER BY v.name
        `).all(),
        db.prepare(`
          SELECT vra.role_id, v.id, v.name, v.slug, v.image_url, m.name as manufacturer_name, v.size_label, v.focus, v.classification
          FROM vehicle_role_assignments vra
          JOIN ${t("vehicles")} v ON v.id = vra.vehicle_id
          LEFT JOIN ${t("manufacturers")} m ON m.id = v.manufacturer_id
          ORDER BY v.name
        `).all(),
      ])

      const vehiclesByCareer = new Map<number, Record<string, unknown>[]>()
      for (const v of careerAssignments.results) {
        const careerId = v.career_id as number
        if (!vehiclesByCareer.has(careerId)) vehiclesByCareer.set(careerId, [])
        vehiclesByCareer.get(careerId)!.push(v)
      }

      const vehiclesByRole = new Map<number, Record<string, unknown>[]>()
      for (const v of roleAssignments.results) {
        const roleId = v.role_id as number
        if (!vehiclesByRole.has(roleId)) vehiclesByRole.set(roleId, [])
        vehiclesByRole.get(roleId)!.push(v)
      }

      const careers = careersResult.results.map((career) => ({
        ...career,
        vehicles: vehiclesByCareer.get(career.id as number) ?? [],
        vehicle_count: (vehiclesByCareer.get(career.id as number) ?? []).length,
      }))

      const roles = rolesResult.results.map((role) => ({
        ...role,
        vehicles: vehiclesByRole.get(role.id as number) ?? [],
        vehicle_count: (vehiclesByRole.get(role.id as number) ?? []).length,
      }))

      return { careers, roles }
    })
  })

  // GET /api/gamedata/reputation — reputation scopes with nested standings
  app.get("/reputation", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:reputation`, async () => {
const { results: scopes } = await db
        .prepare(`SELECT rsc2.* FROM ${t("reputation_scopes")} rsc2
           
           WHERE rsc2.name NOT LIKE '%PLACEHOLDER%'
           ORDER BY rsc2.name`,
        )
        .all()

      const { results: standings } = await db
        .prepare(`SELECT rs.*, rsc.name as scope_name, rsc.uuid as scope_uuid
           FROM ${t("reputation_standings")} rs
           
           JOIN ${t("reputation_scopes")} rsc ON rsc.id = rs.scope_id
           WHERE rs.name != '<= PLACEHOLDER =>'
           ORDER BY rs.scope_id, rs.sort_order`,
        )
        .all()

      const { results: factionLinks } = await db
        .prepare(`SELECT frs.reputation_scope_id, frs.is_primary, f.id as faction_id, f.name as faction_name, f.slug as faction_slug
           FROM ${t("faction_reputation_scopes")} frs
           JOIN ${t("factions")} f ON f.id = frs.faction_id
           ORDER BY frs.is_primary DESC, f.name`,
        )
        .all()

      const standingsByScope = new Map<number, typeof standings>()
      for (const s of standings) {
        const scopeId = s.scope_id as number
        if (!standingsByScope.has(scopeId)) standingsByScope.set(scopeId, [])
        standingsByScope.get(scopeId)!.push(s)
      }

      const factionsByScope = new Map<number, typeof factionLinks>()
      for (const fl of factionLinks) {
        const scopeId = fl.reputation_scope_id as number
        if (!factionsByScope.has(scopeId)) factionsByScope.set(scopeId, [])
        factionsByScope.get(scopeId)!.push(fl)
      }

      const scopesWithStandings = scopes.map((scope) => ({
        ...scope,
        standings: standingsByScope.get(scope.id as number) ?? [],
        factions: factionsByScope.get(scope.id as number) ?? [],
      }))

      return { scopes: scopesWithStandings }
    })
  })

  // GET /api/gamedata/law — infractions, jurisdictions, overrides
  app.get("/law", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:law`, async () => {
const [infractions, jurisdictions, overrides] = await Promise.all([
        db
          .prepare(`SELECT li2.* FROM ${t("law_infractions")} li2
             
             ORDER BY li2.name`,
          )
          .all(),
        db
          .prepare(`SELECT lj2.* FROM ${t("law_jurisdictions")} lj2
             
             ORDER BY lj2.name`,
          )
          .all(),
        db
          .prepare(`SELECT jio.*,
               li.name as infraction_name,
               lj.name as jurisdiction_name,
               li.description as infraction_description,
               li.severity as infraction_severity,
               jio.overrides_json
             FROM ${t("jurisdiction_infraction_overrides")} jio
             JOIN ${t("law_infractions")} li ON li.id = jio.infraction_id
             JOIN ${t("law_jurisdictions")} lj ON lj.id = jio.jurisdiction_id`,
          )
          .all(),
      ])

      return {
        infractions: infractions.results,
        jurisdictions: jurisdictions.results,
        overrides: overrides.results,
      }
    })
  })

  // GET /api/gamedata/mining — full mining data: elements, compositions, refining,
  // locations, deposits, quality distributions, clustering, equipment
  app.get("/mining", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:mining`, async () => {
const [
        elements,
        compositions,
        refining,
        locations,
        deposits,
        qualityDistributions,
        clusteringPresets,
        clusteringParams,
        lasers,
        modules,
        gadgets,
        rockEntities,
        globalParams,
      ] = await Promise.all([
        db
          .prepare(`SELECT me.* FROM ${t("mineable_elements")} me
             
             WHERE me.name NOT LIKE '%Template%'
               AND me.name NOT LIKE '%Testelement%'
             ORDER BY me.name`,
          )
          .all(),
        db
          .prepare(`SELECT rc2.* FROM ${t("rock_compositions")} rc2
             
             ORDER BY rc2.name`,
          )
          .all(),
        db
          .prepare(`SELECT rp.* FROM ${t("refining_processes")} rp
             
             ORDER BY rp.name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_locations")}
             ORDER BY system, name`,
          )
          .all(),
        db
          .prepare(`SELECT d.*, rc.id as rock_composition_id, rc.name as composition_name,
                    rc.rock_type, rc.composition_json
             FROM mining_location_deposits d
             JOIN ${t("mining_locations")} ml ON ml.id = d.mining_location_id
             LEFT JOIN ${t("rock_compositions")} rc ON rc.uuid = d.composition_guid
             ORDER BY d.mining_location_id, d.group_name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_quality_distributions")}`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_clustering_presets")}
             ORDER BY name`,
          )
          .all(),
        db
          .prepare(`SELECT mcp.* FROM mining_clustering_params mcp
             JOIN ${t("mining_clustering_presets")} p ON p.id = mcp.mining_clustering_preset_id
             ORDER BY mcp.mining_clustering_preset_id, mcp.relative_probability DESC`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_lasers")}
             ORDER BY size, name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_modules")}
             ORDER BY type, size, name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_gadgets")}
             ORDER BY name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mineable_rock_entities")}
             WHERE removed = 0 AND (is_deleted IS NULL OR is_deleted = 0)
             ORDER BY class_name`,
          )
          .all(),
        db
          .prepare(`SELECT * FROM ${t("mining_global_params")}
             ORDER BY scope`,
          )
          .all(),
      ])

      // Nest clustering params into their parent presets
      const paramsByPreset = new Map<number, typeof clusteringParams.results>()
      for (const p of clusteringParams.results) {
        const pid = p.mining_clustering_preset_id as number
        if (!paramsByPreset.has(pid)) paramsByPreset.set(pid, [])
        paramsByPreset.get(pid)!.push(p)
      }
      const presetsWithParams = clusteringPresets.results.map((preset) => ({
        ...preset,
        params: paramsByPreset.get(preset.id as number) || [],
      }))

      return {
        elements: elements.results,
        compositions: compositions.results,
        refining: refining.results,
        locations: locations.results,
        deposits: deposits.results,
        quality_distributions: qualityDistributions.results,
        clustering_presets: presetsWithParams,
        lasers: lasers.results,
        modules: modules.results,
        gadgets: gadgets.results,
        rock_entities: rockEntities.results,
        global_params: globalParams.results,
      }
    })
  })

  // GET /api/gamedata/shops — shop list with item counts
  app.get("/shops", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:shops`, async () => {
      // F404: exclude shops whose `location_label` is a raw internal CIG
      // code (derelict-settlement short form, distribution-centre numeric
      // codes, paradise-bay cluster tags, raw-location / region-encounter
      // entries, admin / template / container-rooted routing shops).
      // These aren't player-visitable places — they're internal routing
      // rows. Shops with clean location labels (Orison, Lorville, Area18,
      // etc.) stay visible.
      const { results } = await db
        .prepare(`SELECT s.*,
             ${SHOP_DISPLAY_NAME_EXPR} as display_name,
             (SELECT COUNT(*) FROM ${t("terminal_inventory")} ti JOIN ${t("terminals")} t ON t.id = ti.terminal_id WHERE t.shop_id = s.id) as item_count,
             s.location_label as location_name
           FROM ${t("shops")} s
           WHERE COALESCE(s.shop_type, '') != 'admin'
             AND (s.location_label IS NULL
                  OR (
                    s.location_label NOT LIKE 'Drlct%'
                    AND s.location_label NOT LIKE 'Pbay%'
                    AND s.location_label NOT LIKE 'RL %'
                    AND s.location_label NOT LIKE 'RegionC%'
                    AND s.location_label NOT LIKE 'ab %'
                    AND s.location_label NOT LIKE 's1 dc%'
                    AND s.location_label NOT LIKE 's2 dc%'
                    AND s.location_label NOT LIKE 's3 dc%'
                    AND s.location_label NOT LIKE 's4 dc%'
                    AND LOWER(s.location_label) NOT LIKE '%socpak%'
                    AND s.location_label NOT LIKE 'Foyer%'
                    AND s.location_label NOT LIKE 'ObjectContainer%'
                  ))
             AND s.name NOT LIKE 'OC %'
             AND s.name NOT LIKE 'OOC %'
             AND s.name NOT LIKE 'LOC %'
             AND s.name NOT LIKE '%NONPURCHASABLE%'
           ORDER BY s.name`,
        )
        .all()

      return results
    })
  })

  // GET /api/gamedata/shops/:slug/inventory — inventory for a specific shop
  app.get("/shops/:slug/inventory", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const slug = c.req.param("slug")
    if (slug.length > 100) return c.json({ error: "Not found" }, 404)
    const db = c.env.DB
    // Verify shop exists before caching (prevents cache pollution with fake slugs)
    const shop = await db
      .prepare(`SELECT s.id FROM ${t("shops")} s WHERE s.slug = ?`)
      .bind(slug)
      .first()
    if (!shop) return c.json({ error: "Not found" }, 404)

    return cachedJson(c, `gd:shop-inv:${cacheSlug(slug)}`, async () => {
      const { results } = await db
        .prepare(`SELECT ti.item_uuid, ti.item_name,
             ${buyPriceSQL("ti")} as buy_price,
             ${sellPriceSQL("ti")} as sell_price,
             ti.base_inventory, ti.max_inventory,
             COALESCE(fi.name, v.name, ti.item_name) as resolved_name
           FROM ${t("terminal_inventory")} ti
           JOIN ${t("terminals")} t ON t.id = ti.terminal_id
           JOIN ${t("shops")} s ON s.id = t.shop_id
           LEFT JOIN ${t("loot_map")} fi ON fi.uuid = ti.item_uuid
           LEFT JOIN ${t("vehicles")} v ON v.uuid = ti.item_uuid
           WHERE s.slug = ?
           ORDER BY COALESCE(fi.name, v.name, ti.item_name),
                    ${buyPriceSQL("ti")} DESC`,
        )
        .bind(slug)
        .all()

      return results
    })
  })

  // GET /api/gamedata/trade — trade commodities with per-shop buy/sell/stock data
  app.get("/trade", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
return cachedJson(c, `gd:trade`, async () => {
      const [commoditiesResult, listingsResult] = await Promise.all([
        db
          .prepare(`SELECT tc2.* FROM ${t("trade_commodities")} tc2
             
             ORDER BY tc2.category, tc2.name`,
          )
          .all(),
        db
          .prepare(`SELECT ti.item_uuid,
               ${buyPriceSQL("ti")} as buy_price,
               ${sellPriceSQL("ti")} as sell_price,
               ti.base_inventory, ti.max_inventory,
               s.name as shop_name, s.slug as shop_slug,
               ${SHOP_DISPLAY_NAME_EXPR} as shop_display_name,
               s.location_label
             FROM ${t("terminal_inventory")} ti
             JOIN ${t("terminals")} t ON t.id = ti.terminal_id
             JOIN ${t("shops")} s ON s.id = t.shop_id
             JOIN ${t("trade_commodities")} tc ON tc.uuid = ti.item_uuid
             WHERE s.shop_type = 'admin'
             ORDER BY s.location_label, s.name`,
          )
          .all(),
      ])

      const listingsByUuid = new Map<string, Record<string, unknown>[]>()
      for (const l of listingsResult.results) {
        const uuid = l.item_uuid as string
        if (!listingsByUuid.has(uuid)) listingsByUuid.set(uuid, [])
        listingsByUuid.get(uuid)!.push(l)
      }

      const commodities = commoditiesResult.results.map((comm) => ({
        ...comm,
        listings: listingsByUuid.get(comm.uuid as string) ?? [],
      }))

      const locations = [
        ...new Set(
          listingsResult.results
            .map((l) => l.location_label as string)
            .filter(Boolean),
        ),
      ].sort()

      return { commodities, locations }
    })
  })

  // GET /api/gamedata/poi/:slug — unified POI detail.
  // Accepts both container-side slugs (e.g. "FloatingIslands") and canonical
  // star_map_locations slugs (e.g. "stanton2-orison"). Returns a single
  // payload with per-section envelopes (shops / loot_pools / missions /
  // npc_factions / siblings) so one slow subsystem degrades its section
  // rather than the whole page. See plan:
  // /home/gavin/.claude/plans/curious-popping-toucan.md
  app.get("/poi/:slug", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const slug = c.req.param("slug")
    const resolved = resolvePOISlug(slug)
    const db = c.env.DB
    // cachedJson auto-404s on null return — we use that when the slug
    // doesn't resolve to any star_map_locations row. Empty-state POIs still
    // return a populated object (location + zero-count sections).
    // Cache key auto-namespaces by channel via the cache layer.
    return cachedJson(c, `gd:poi:${cacheSlug(slug)}`, () =>
      getPOIDetail(db, slug, resolved, isPTU),
    )
  })

  // GET /api/gamedata/poi/:slug/children — full uncapped list of POIs under
  // a given parent. Powers the `/poi/at/:parentSlug` "see all" page referenced
  // from the sibling section's truncated warning.
  app.get("/poi/:slug/children", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const slug = c.req.param("slug")
    const db = c.env.DB
    return cachedJson(c, `gd:poi-children:${cacheSlug(slug)}`, () =>
      getPOIChildren(db, slug, isPTU),
    )
  })

  // GET /api/gamedata/locations/:slug/shops — shops at a location with inventory
  app.get("/locations/:slug/shops", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const slug = c.req.param("slug")
    const db = c.env.DB
return cachedJson(c, `gd:loc-shops:${cacheSlug(slug)}`, async () => {
      const location = await db
        .prepare(`SELECT sml.id, sml.name, sml.slug, sml.location_type
           FROM ${t("star_map_locations")} sml
           
           WHERE sml.slug = ?
           LIMIT 1`,
        )
        .bind(slug)
        .first()

      if (!location) {
        // Fallback: match slug against location_label on shops directly
        // (star_map_locations may not have a matching slug for common location names).
        // Public POI page excludes `shop_type='admin'` (dev/template shops) and
        // shops whose name is a container-tree artifact (plain "Stanton",
        // "Stanton 1 Hurston", "OC <x>") — those are internal routing rows,
        // not real in-game shops players can visit.
        const labelSlug = slug.replace(/-/g, ' ')
        const { results: labelShops } = await db
          .prepare(`SELECT s.id, s.name, s.slug, s.shop_type, s.location_label, NULL as placement_name
             FROM ${t("shops")} s
             WHERE LOWER(REPLACE(s.location_label, ' ', '')) = LOWER(REPLACE(?, ' ', ''))
               AND COALESCE(s.shop_type, '') != 'admin'
               AND s.name NOT LIKE 'Stanton%'
               AND s.name NOT LIKE 'OC %'
               AND s.name NOT LIKE 'OOC %'
               AND s.name NOT LIKE 'RR %'
               AND s.name NOT LIKE 'LOC %'
               AND s.name NOT LIKE 'Grim HEX OC%'
             ORDER BY s.shop_type, s.name`,
          )
          .bind(labelSlug)
          .all()

        if (labelShops.length === 0) return { location: null, shops: [] }

        const labelShopIds = labelShops.map((s) => s.id as number)
        const labelPlaceholders = labelShopIds.map(() => "?").join(",")
        const { results: labelInv } = await db
          .prepare(buildInventoryQuery(labelPlaceholders, isPTU))
          .bind(...labelShopIds)
          .all()

        return { location: { name: labelShops[0].location_label, slug }, shops: nestInventoryUnderShops(labelShops, labelInv) }
      }
      const { results: childLocations } = await db
        .prepare(`SELECT sml2.id FROM ${t("star_map_locations")} sml2
           
           WHERE (sml2.id = ? OR sml2.parent_uuid = (
             SELECT sml3.uuid FROM ${t("star_map_locations")} sml3 WHERE sml3.id = ?
           ))`,
        )
        .bind(location.id, location.id)
        .all()

      const locationIds = childLocations.map((r) => r.id as number)
      if (locationIds.length === 0) {
        return { location, shops: [] }
      }

      const placeholders = locationIds.map(() => "?").join(",")
      // Two-path JOIN: shop_locations junction OR direct location_label match
      // on the star_map_location name. The junction table is sparse on
      // non-pipeline-linked shops — e.g. Orison has 40 real shops (Ellroys,
      // Whammers, CousinCrows, Covalex, etc.) with `location_label='Orison'`
      // but shop_locations only connects 4 internal routing rows. Falling
      // back to the label match recovers the real inventory.
      const { results: shops } = await db
        .prepare(`SELECT DISTINCT s.id, s.name, s.slug, s.shop_type, s.location_label,
             COALESCE(sl.placement_name, s.location_label) AS placement_name
           FROM ${t("shops")} s
           LEFT JOIN ${t("shop_locations")} sl ON sl.shop_id = s.id
             AND sl.location_id IN (${placeholders})
           WHERE (
               sl.location_id IN (${placeholders})
               OR s.location_label = (SELECT name FROM ${t("star_map_locations")} WHERE id = ?)
             )
             AND COALESCE(s.shop_type, '') != 'admin'
             AND s.name NOT LIKE 'Stanton%'
             AND s.name NOT LIKE 'OC %'
             AND s.name NOT LIKE 'OOC %'
             AND s.name NOT LIKE 'RR %'
             AND s.name NOT LIKE 'LOC %'
             AND s.name NOT LIKE 'Grim HEX OC%'
             AND s.name NOT LIKE '%NONPURCHASABLE%'
           ORDER BY s.shop_type, s.name`,
        )
        .bind(...locationIds, ...locationIds, location.id)
        .all()

      if (shops.length === 0) {
        const { results: directShops } = await db
          .prepare(`SELECT s.id, s.name, s.slug, s.shop_type, s.location_label, NULL as placement_name
             FROM ${t("shops")} s
             WHERE s.location_id IN (${placeholders})
               AND COALESCE(s.shop_type, '') != 'admin'
               AND s.name NOT LIKE 'Stanton%'
               AND s.name NOT LIKE 'OC %'
               AND s.name NOT LIKE 'OOC %'
               AND s.name NOT LIKE 'RR %'
               AND s.name NOT LIKE 'LOC %'
               AND s.name NOT LIKE 'Grim HEX OC%'
             ORDER BY s.shop_type, s.name`,
          )
          .bind(...locationIds)
          .all()

        if (directShops.length === 0) {
          return { location, shops: [] }
        }

        const directShopIds = directShops.map((s) => s.id as number)
        const invPlaceholders = directShopIds.map(() => "?").join(",")
        const { results: inventory } = await db
          .prepare(buildInventoryQuery(invPlaceholders, isPTU))
          .bind(...directShopIds)
          .all()

        return { location, shops: nestInventoryUnderShops(directShops, inventory) }
      }

      const shopIds = shops.map((s) => s.id as number)
      const invPlaceholders = shopIds.map(() => "?").join(",")
      const { results: inventory } = await db
        .prepare(buildInventoryQuery(invPlaceholders, isPTU))
        .bind(...shopIds)
        .all()

      return { location, shops: nestInventoryUnderShops(shops, inventory) }
    })
  })

  // GET /api/gamedata/weapon-racks — vehicle weapon racks grouped by vehicle
  app.get("/weapon-racks", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:weapon-racks`, async () => {
      const { results } = await db
        .prepare(`SELECT wr.*, v.name as vehicle_name, v.slug as vehicle_slug,
             m.name as manufacturer_name, m.code as manufacturer_code
           FROM ${t("vehicle_weapon_racks")} wr
           
           LEFT JOIN ${t("vehicles")} v ON v.id = wr.vehicle_id
           LEFT JOIN ${t("manufacturers")} m ON m.id = v.manufacturer_id
           ORDER BY v.name, wr.rack_label`,
        )
        .all()
      return results
    })
  })

  // GET /api/gamedata/suit-lockers — vehicle suit lockers grouped by vehicle
  app.get("/suit-lockers", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:suit-lockers`, async () => {
      const { results } = await db
        .prepare(`SELECT sl.*, v.name as vehicle_name, v.slug as vehicle_slug,
             m.name as manufacturer_name, m.code as manufacturer_code
           FROM ${t("vehicle_suit_lockers")} sl
           
           LEFT JOIN ${t("vehicles")} v ON v.id = sl.vehicle_id
           LEFT JOIN ${t("manufacturers")} m ON m.id = v.manufacturer_id
           ORDER BY v.name, sl.locker_label`,
        )
        .all()
      return results
    })
  })


  // GET /api/gamedata/npc-loadouts — list all factions with loadout counts
  app.get("/npc-loadouts", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:npc-loadouts`, async () => {
      const { results: factions } = await db
        .prepare(`SELECT f.id, f.code, f.name,
             COUNT(nl.id) as loadout_count,
             SUM(nl.visible_item_count) as item_count
           FROM npc_factions f
           JOIN ${t("npc_loadouts")} nl ON nl.faction_id = f.id
           
           WHERE nl.visible_item_count > 0
           GROUP BY f.id
           ORDER BY f.name`,
        )
        .all()
      return factions
    })
  })

  // GET /api/gamedata/npc-loadouts/:faction — paginated loadouts for a faction with nested items
  app.get("/npc-loadouts/:faction", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const factionCode = c.req.param("faction")
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1)
    const perPage = Math.min(100, Math.max(1, parseInt(c.req.query("per_page") || "50", 10) || 50))
    const db = c.env.DB
    return cachedJson(c, `gd:npc-loadout:${cacheSlug(factionCode)}:p${page}:pp${perPage}`, async () => {
      const faction = await db
        .prepare("SELECT * FROM npc_factions WHERE code = ? LIMIT 1")
        .bind(factionCode)
        .first()

      if (!faction) return null

      // Count total visible loadouts (those with at least one non-hidden item)
      const countRow = await db
        .prepare(`SELECT COUNT(*) as total FROM ${t("npc_loadouts")} nl
           
           WHERE nl.faction_id = ?
             AND nl.visible_item_count > 0`,
        )
        .bind(faction.id)
        .first<{ total: number }>()

      const totalLoadouts = countRow?.total ?? 0
      const totalPages = Math.ceil(totalLoadouts / perPage)
      const offset = (page - 1) * perPage

      // Fetch paginated loadouts — only those with visible items
      const { results: loadouts } = await db
        .prepare(`SELECT nl.*
           FROM ${t("npc_loadouts")} nl
           
           WHERE nl.faction_id = ?
             AND nl.visible_item_count > 0
           ORDER BY nl.category, nl.sub_category, nl.loadout_name
           LIMIT ? OFFSET ?`,
        )
        .bind(faction.id, perPage, offset)
        .all()

      let items: Record<string, unknown>[] = []

      if (loadouts.length > 0) {
        // Build placeholders for the current page's loadout IDs
        const loadoutIds = loadouts.map((l) => l.id as number)
        const placeholders = loadoutIds.map(() => "?").join(",")
        const { results } = await db
          .prepare(`SELECT nli.*, nli.loot_map_uuid as loot_uuid
             FROM ${t("npc_loadout_items")} nli
             WHERE nli.loadout_id IN (${placeholders})
               AND nli.is_hidden = 0
             ORDER BY nli.loadout_id, nli.id`,
          )
          .bind(...loadoutIds)
          .all()
        items = results
      }

      const itemsByLoadout = new Map<number, typeof items>()
      for (const item of items) {
        const loadoutId = item.loadout_id as number
        if (!itemsByLoadout.has(loadoutId)) itemsByLoadout.set(loadoutId, [])
        itemsByLoadout.get(loadoutId)!.push(item)
      }

      const loadoutsWithItems = loadouts.map((loadout) => ({
        ...loadout,
        items: itemsByLoadout.get(loadout.id as number) ?? [],
      }))

      return {
        faction,
        loadouts: loadoutsWithItems,
        page,
        perPage,
        totalLoadouts,
        totalPages,
      }
    })
  })

  // GET /api/gamedata/missions — mission types + givers with faction/location data
  // NOTE: intentionally API-only for now (no frontend page). The data exists (38 mission
  // types) and is returned correctly; a Missions page is deferred to a future milestone.
  app.get("/missions", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
return cachedJson(c, `gd:missions`, async () => {
      const [typesResult, giversResult, missionsResult, prereqResult, repReqResult, repChangeResult] = await Promise.all([
        db.prepare(`SELECT mt.* FROM ${t("mission_types")} mt
           
           WHERE mt.name != '<= PLACEHOLDER =>'
           ORDER BY mt.name`,
        ).all(),
        db.prepare(`SELECT mg.*,
             f.name as faction_name, f.slug as faction_slug,
             sml.name as location_name
           FROM ${t("mission_givers")} mg
           
           LEFT JOIN ${t("factions")} f ON f.id = mg.faction_id
           LEFT JOIN ${t("star_map_locations")} sml ON sml.id = mg.location_id
           WHERE mg.name != '<= PLACEHOLDER =>'
             AND mg.name != '<= UNINITIALIZED =>'
           ORDER BY mg.name`,
        ).all(),
        db.prepare(`SELECT m.id, m.uuid, m.slug,
             COALESCE(m.title, m.name) as title,
             -- Giver is separate from the mission title; don't fall back to
             -- display_name (which is just the localised title). If the
             -- pipeline couldn't resolve a giver, leave it null so the UI
             -- hides the field instead of echoing the title.
             m.mission_giver as giver_name,
             m.description,
             -- 0213: when is_dynamic_reward=1 the payout is runtime-computed
             -- (cargo grade, distance, rep tier); return NULL so the UI can
             -- show "Dynamic" instead of a misleading 0.
             CASE WHEN m.is_dynamic_reward = 1 THEN NULL
                  ELSE COALESCE(NULLIF(m.reward_amount, 0), m.reward_min, 0)
             END as reward_amount,
             COALESCE(m.is_dynamic_reward, 0) as is_dynamic_reward,
             m.reward_currency,
             COALESCE(m.is_lawful, 0) as is_lawful,
             m.difficulty,
             COALESCE(m.category, m.mission_type) as category,
             m.subcategory as availability,
             m.location_hint as type_slug,
             m.reputation_reward_size as rep_summary,
             m.min_reputation,
             m.rep_fail_summary as rep_fail,
             m.rep_abandon_summary as rep_abandon,
             m.time_limit_minutes, m.max_players, m.can_share, m.once_only,
             m.fail_if_criminal, m.available_in_prison,
             m.wanted_level_min, m.wanted_level_max,
             m.buy_in_amount,
             CASE WHEN m.is_dynamic_reward = 1 AND m.reward_max IN (0, 1) THEN NULL
                  ELSE m.reward_max
             END as reward_max,
             m.has_standing_bonus,
             m.location_ref, m.locality,
             -- Mark mission as template when its TITLE contains unresolved runtime
             -- placeholder tokens — CIG fills these per generated instance, so the
             -- title is not meaningfully renderable in a flat list. Two on-disk
             -- forms: legacy curly-brace (Creature in braces) AND the PART K K4
             -- tagged form (var name= tags). Match BOTH.
             --
             -- Title only, NOT description: a mission with a concrete title
             -- (e.g. "Eradicate All Nests") but a templated description body is
             -- still a real, listable mission — its title renders fine. Checking
             -- the description over-flagged ~600 such missions as templates after
             -- K4 widened description tagging.
             CASE
               WHEN (COALESCE(m.title, m.name) LIKE '%{%}%')
                 OR (COALESCE(m.title, m.name) LIKE '%<var name=%')
               THEN 1 ELSE 0
             END as is_template
           FROM ${t("missions")} m
           WHERE COALESCE(m.not_for_release, 0) = 0
           ORDER BY COALESCE(m.category, m.mission_type), COALESCE(m.reward_amount, m.reward_min, 0) DESC`,
        ).all(),
        db.prepare(`SELECT mp.mission_id, m_req.uuid as required_uuid, COALESCE(m_req.title, m_req.name) as required_title
           FROM ${t("mission_prerequisites")} mp
           JOIN ${t("missions")} m_req ON m_req.id = mp.required_mission_id`,
        ).all(),
        db.prepare(`SELECT mrr.mission_id, mrr.faction_slug, mrr.scope_slug,
                  mrr.comparison, mrr.standing_slug
           FROM ${t("mission_reputation_requirements")} mrr`,
        ).all(),
        // PART K K13: structured per-mission rep changes (mig 0242). Replaces the
        // opaque rep_fail / rep_abandon summary strings for the UI's RepCostBadges
        // component. Empty until the K8 re-extract lands rows — until then the
        // raw rep_fail / rep_abandon strings on each mission row remain the source.
        db.prepare(`SELECT mrc.mission_id, mrc.scope_slug, mrc.event,
                  mrc.size_code, mrc.direction, mrc.rep_amount
           FROM ${t("mission_rep_changes")} mrc`,
        ).all(),
      ])

      // Build prerequisites map: mission_id → array of required missions
      const prerequisites: Record<number, { uuid: string; title: string }[]> = {}
      for (const row of prereqResult.results) {
        const mid = row.mission_id as number
        if (!prerequisites[mid]) prerequisites[mid] = []
        prerequisites[mid].push({
          uuid: row.required_uuid as string,
          title: row.required_title as string,
        })
      }

      // Build rep requirements map: mission_id → array of reputation requirements
      const rep_requirements: Record<number, { faction_slug: string; scope_slug: string; comparison: string; standing_slug: string }[]> = {}
      for (const row of repReqResult.results) {
        const mid = row.mission_id as number
        if (!rep_requirements[mid]) rep_requirements[mid] = []
        rep_requirements[mid].push({
          faction_slug: row.faction_slug as string,
          scope_slug: row.scope_slug as string,
          comparison: row.comparison as string,
          standing_slug: row.standing_slug as string,
        })
      }

      // PART K K13: rep_changes map: mission_id → structured (scope, event, size, direction, rep_amount) rows.
      // Populated by the next K8 extractor run; until then the map is empty and the UI
      // falls back to parsing the raw rep_fail / rep_abandon strings on each mission row.
      const rep_changes: Record<number, { scope_slug: string; event: string; size_code: string; direction: string; rep_amount: number | null }[]> = {}
      for (const row of repChangeResult.results) {
        const mid = row.mission_id as number
        if (!rep_changes[mid]) rep_changes[mid] = []
        rep_changes[mid].push({
          scope_slug: row.scope_slug as string,
          event: row.event as string,
          size_code: row.size_code as string,
          direction: row.direction as string,
          rep_amount: row.rep_amount as number | null,
        })
      }

      // F300: 11 mission descriptions contain `~serviceBeacon(InitiatorName)`
      // and similar runtime-bound templates that CIG resolves per-pickup.
      // Collapse to `{Key}` placeholders here at the API layer so every
      // consumer (future mobile app, export, etc.) gets clean text, not
      // just the web frontend via cleanMissionDescription.
      const RUNTIME_TEMPLATE_RE = /~[a-z]+\(([^|)]*\|)?([A-Za-z0-9_]+)\)/gi
      const missions = (missionsResult.results as Array<Record<string, unknown>>).map(m => {
        const desc = m.description as string | null | undefined
        if (desc && RUNTIME_TEMPLATE_RE.test(desc)) {
          return {
            ...m,
            description: desc.replace(RUNTIME_TEMPLATE_RE, (_, _contractor, key) => `{${key}}`),
          }
        }
        return m
      })
      return {
        types: typesResult.results,
        givers: giversResult.results,
        missions,
        prerequisites,
        rep_requirements,
        rep_changes,
      }
    })
  })

  // Weapon bench (#200) — attachments WITH their stat-multiplier columns. Weapons
  // + crafting come from /api/gamedata/crafting; this fills the attachment gap the
  // /fps-gear query omits.
  app.get("/weapon-bench", async (c) => {
    const db = c.env.DB;
    return cachedJson(c, `gd:weapon-bench`, async () => {
      const { results } = await db
        .prepare(
          `SELECT a.uuid, a.name, a.class_name, a.sub_type, a.size,
                  a.damage_multiplier, a.fire_rate_multiplier,
                  a.projectile_speed_multiplier, a.heat_generation_multiplier,
                  m.name AS manufacturer_name, lm.rarity
           FROM fps_attachments a
           LEFT JOIN manufacturers m ON m.id = a.manufacturer_id
           LEFT JOIN loot_map lm ON lm.fps_attachment_id = a.id
           ORDER BY a.name`,
        )
        .all();
      return { attachments: results };
    });
  });

  // GET /api/gamedata/crafting — all blueprints with slots and modifiers
  app.get("/crafting", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
return cachedJson(c, `gd:crafting`, async () => {
      const [bpResult, slotResult, modResult, propResult, resResult] = await Promise.all([
        db.prepare(`SELECT cb.id, cb.uuid, cb.tag, cb.name, cb.type, cb.sub_type, cb.craft_time_seconds, cb.is_default
           FROM ${t("crafting_blueprints")} cb

           ORDER BY cb.type, cb.sub_type, cb.name`
        ).all(),
        db.prepare(`SELECT MIN(cbs.id) AS id, cbs.crafting_blueprint_id, cbs.slot_index, COALESCE(cbs.slot_name, cbs.name) AS name,
                  cbs.resource_name, cbs.quantity, cbs.min_quality,
                  cbs.slot_type, cbs.item_class
           FROM ${t("crafting_blueprint_slots")} cbs
           JOIN ${t("crafting_blueprints")} cb ON cb.id = cbs.crafting_blueprint_id
           GROUP BY cbs.crafting_blueprint_id, cbs.slot_index
           ORDER BY cbs.crafting_blueprint_id, cbs.slot_index`
        ).all(),
        db.prepare(`SELECT csm.crafting_blueprint_slot_id, cp.key, cp.name, cp.unit, cp.category,
                  MIN(csm.start_quality) AS start_quality, MIN(csm.end_quality) AS end_quality,
                  MIN(csm.modifier_at_start) AS modifier_at_start, MIN(csm.modifier_at_end) AS modifier_at_end
           FROM ${t("crafting_slot_modifiers")} csm
           JOIN crafting_properties cp ON cp.id = csm.crafting_property_id
           JOIN ${t("crafting_blueprint_slots")} cbs ON cbs.id = csm.crafting_blueprint_slot_id
           JOIN ${t("crafting_blueprints")} cb ON cb.id = cbs.crafting_blueprint_id
           GROUP BY csm.crafting_blueprint_slot_id, csm.crafting_property_id`
        ).all(),
        db.prepare(`SELECT id, key, name, unit, category FROM crafting_properties ORDER BY id`).all(),
        db.prepare(`SELECT cr.name FROM ${t("crafting_resources")} cr
           
           ORDER BY cr.name`
        ).all(),
      ])

      // Nest slots and modifiers into blueprints
      const modsBySlot = new Map<number, Record<string, unknown>[]>()
      for (const mod of modResult.results) {
        const slotId = mod.crafting_blueprint_slot_id as number
        if (!modsBySlot.has(slotId)) modsBySlot.set(slotId, [])
        modsBySlot.get(slotId)!.push(mod)
      }

      const slotsByBp = new Map<number, Record<string, unknown>[]>()
      for (const slot of slotResult.results) {
        const bpId = slot.crafting_blueprint_id as number
        const slotId = slot.id as number
        const enriched = { ...slot, modifiers: modsBySlot.get(slotId) ?? [] }
        if (!slotsByBp.has(bpId)) slotsByBp.set(bpId, [])
        slotsByBp.get(bpId)!.push(enriched)
      }

      // Look up base stats for weapon/armour blueprints by matching the
      // blueprint tag (BP_CRAFT_xxx) → class_name (xxx). Lowercase both
      // sides because vehicle weapon class_names ship uppercase in tags
      // (BP_CRAFT_BANU_TachyonCannon_S1) but lowercase in vehicle_components
      // (banu_tachyoncannon_s1), while FPS weapons are lowercase on both.
      const weaponTags = bpResult.results
        .filter((bp) => bp.type === "weapons")
        .map((bp) => (bp.tag as string).replace("BP_CRAFT_", "").toLowerCase())
      const armourTags = bpResult.results
        .filter((bp) => bp.type === "armour")
        .map((bp) => (bp.tag as string).replace("BP_CRAFT_", "").toLowerCase())

      const baseStatsMap = new Map<string, Record<string, unknown>>()

      if (weaponTags.length > 0) {
        // FPS handheld weapons (FS-9 LMG, Arclight Pistol, etc.)
        const weaponResult = await db.prepare(`SELECT fw.class_name, fw.name, fw.rounds_per_minute, fw.damage, fw.dps,
                  fw.effective_range, fw.projectile_speed, fw.ammo_capacity,
                  fw.spread_min, fw.spread_max, fw.damage_type, fw.fire_modes,
                  fw.loadout_icon
           FROM ${t("fps_weapons")} fw
          `
        ).all()
        for (const w of weaponResult.results) {
          const cn = (w.class_name as string).toLowerCase()
          if (weaponTags.includes(cn) && !baseStatsMap.has(cn)) {
            baseStatsMap.set(cn, {
              item_name: w.name,
              rounds_per_minute: w.rounds_per_minute,
              damage: w.damage,
              dps: w.dps,
              effective_range: w.effective_range,
              projectile_speed: w.projectile_speed,
              ammo_capacity: w.ammo_capacity,
              spread_min: w.spread_min,
              spread_max: w.spread_max,
              damage_type: w.damage_type,
              fire_modes: w.fire_modes,
              loadout_icon: w.loadout_icon,
            })
          }
        }

        // Vehicle weapons (ship-mounted cannons/repeaters/gatlings). Joined
        // through vehicle_components → component_weapons. The
        // vehicle_components row carries the canonical `size` (S1-S7) used
        // by the Ship Weapons size filter — surface it as `ship_size` so
        // the frontend doesn't have to parse class names.
        const vehicleWeaponResult = await db.prepare(`SELECT vc.class_name, vc.name, vc.size AS ship_size,
                  cw.rounds_per_minute, cw.damage_per_shot, cw.dps,
                  cw.effective_range, cw.projectile_speed, cw.damage_type, cw.fire_modes
           FROM ${t("component_weapons")} cw
           JOIN ${t("vehicle_components")} vc ON vc.id = cw.component_id`
        ).all()
        for (const w of vehicleWeaponResult.results) {
          const cn = (w.class_name as string).toLowerCase()
          if (weaponTags.includes(cn) && !baseStatsMap.has(cn)) {
            baseStatsMap.set(cn, {
              item_name: w.name,
              ship_size: w.ship_size,
              rounds_per_minute: w.rounds_per_minute,
              damage: w.damage_per_shot,
              dps: w.dps,
              effective_range: w.effective_range,
              projectile_speed: w.projectile_speed,
              damage_type: w.damage_type,
              fire_modes: w.fire_modes,
            })
          }
        }
      }

      if (armourTags.length > 0) {
// Query fps_armour (body pieces + undersuits) and fps_helmets in parallel
        const [armourResult, helmetResult] = await Promise.all([
          db.prepare(`SELECT fa.class_name, fa.name, fa.sub_type,
                    fa.resist_physical, fa.resist_energy, fa.resist_distortion,
                    fa.resist_thermal, fa.resist_biochemical, fa.resist_stun
             FROM ${t("fps_armour")} fa
            `
          ).all(),
          db.prepare(`SELECT fh.class_name, fh.name
             FROM ${t("fps_helmets")} fh
            `
          ).all(),
        ])
        for (const a of armourResult.results) {
          const cn = (a.class_name as string).toLowerCase()
          if (armourTags.includes(cn) && !baseStatsMap.has(cn)) {
            // fps_armour.sub_type stores the WEIGHT (Light/Medium/Heavy/
            // Personal). Surface it as `armour_weight` so the FPS Armour
            // filter row can offer a Weight axis distinct from the BP's
            // own sub_type (which holds the role: combat/hunter/...).
            baseStatsMap.set(cn, {
              item_name: a.name,
              armour_weight: a.sub_type,
              sub_type: a.sub_type,
              resist_physical: a.resist_physical,
              resist_energy: a.resist_energy,
              resist_distortion: a.resist_distortion,
              resist_thermal: a.resist_thermal,
              resist_biochemical: a.resist_biochemical,
              resist_stun: a.resist_stun,
            })
          }
        }
        for (const h of helmetResult.results) {
          const cn = (h.class_name as string).toLowerCase()
          if (armourTags.includes(cn) && !baseStatsMap.has(cn)) {
            // Helmets share the armour BP type but live in fps_helmets;
            // they don't carry a weight value of their own (no sub_type
            // column with weight data). Leave armour_weight unset.
            baseStatsMap.set(cn, { item_name: h.name })
          }
        }
      }

      const blueprints = bpResult.results.map((bp) => {
        const tag = bp.tag as string
        // Lowercase to match the lowercased keys in baseStatsMap. Vehicle
        // weapon tags ship uppercase (BANU_TachyonCannon_S1) but their
        // class_names are lowercase in vehicle_components.
        const className = tag.replace("BP_CRAFT_", "").toLowerCase()
        // Strip variant suffixes to find the base weapon
        // e.g. behr_lmg_ballistic_01_tint01 → behr_lmg_ballistic_01
        let baseStats = baseStatsMap.get(className)
        if (!baseStats) {
          // Try matching base weapon by removing trailing _suffix patterns
          // Variants: _tint01, _xenothreat01, _yellow_grey01, _collector01, etc.
          for (const [cn, stats] of baseStatsMap) {
            if (className.startsWith(cn + "_") || className === cn) {
              baseStats = stats
              break
            }
          }
        }
        // `$templates` is a CIG localization key that occasionally leaks
        // into the sub_type column for ship-weapon blueprints (e.g. Banu
        // Tachyoncannon). It's not a real category — strip it so the UI
        // shows just the type label.
        const subType = (bp.sub_type as string | null)?.startsWith("$")
          ? null
          : bp.sub_type
        return {
          ...bp,
          sub_type: subType,
          slots: slotsByBp.get(bp.id as number) ?? [],
          ...(baseStats ? { base_stats: baseStats } : {}),
        }
      })

      // Fetch blueprint acquisition sources via contract generator system
      const acquisitionResult = await db.prepare(`SELECT DISTINCT rpi.crafting_blueprint_id,
                cg.generator_key, cg.display_name, cg.faction_name, cg.mission_type
         FROM ${t("crafting_blueprint_reward_pool_items")} rpi
         JOIN ${t("crafting_blueprint_reward_pools")} rp ON rp.id = rpi.crafting_blueprint_reward_pool_id
         JOIN ${t("contract_generator_blueprint_pools")} cgbp ON cgbp.crafting_blueprint_reward_pool_id = rp.id
         JOIN ${t("contract_generator_contracts")} cgc ON cgc.id = cgbp.contract_generator_contract_id
         JOIN ${t("contract_generator_careers")} cgca ON cgca.id = cgc.career_id
         JOIN ${t("contract_generators")} cg ON cg.id = cgca.contract_generator_id`
      ).all()

      // Build acquisition map: blueprint_id → [{ source, generator_key, display_name, ... }]
      type AcquisitionEntry = { source: string; generator_key: string; display_name: string; faction_name: string; mission_type: string }
      const acquisitionMap = new Map<number, AcquisitionEntry[]>()
      for (const row of acquisitionResult.results) {
        const bpId = row.crafting_blueprint_id as number
        if (!acquisitionMap.has(bpId)) acquisitionMap.set(bpId, [])
        const entries = acquisitionMap.get(bpId)!
        const genKey = row.generator_key as string
        if (!entries.some(e => e.generator_key === genKey)) {
          entries.push({
            source: "contract",
            generator_key: genKey,
            display_name: (row.display_name as string) || genKey,
            faction_name: (row.faction_name as string) || "",
            mission_type: (row.mission_type as string) || "",
          })
        }
      }

      // Attach to blueprints
      for (const bp of blueprints) {
        const sources = acquisitionMap.get((bp as Record<string, unknown>).id as number)
        if (sources && sources.length > 0) {
          (bp as Record<string, unknown>).acquisition = sources
        }
      }

      // Fetch resource location data using separate queries for compositions and deposits.
      // Compositions may be updated in new versions (e.g. 4.7 added ouratite/aslarite)
      // while deposit-to-location mappings may only exist for older versions.
      // Matching by class_name lets new compositions inherit location data.
      const classNameFilters = `
        rc.class_name NOT LIKE '%test%'
        AND rc.class_name NOT LIKE 'FPS_Composition_%'
        AND rc.class_name NOT LIKE 'GroundVehicle_%'
        AND rc.class_name NOT LIKE 'TestCompositionPreset%'
        AND rc.class_name NOT LIKE 'TestFPSDeposit%'`

      const [compositionResult, depositLocResult, qualityResult] = await Promise.all([
        // Latest compositions per class_name (for element data)
        db
          .prepare(`SELECT rc.class_name, rc.composition_json
             FROM ${t("rock_compositions")} rc
             WHERE ${classNameFilters}
             ORDER BY rc.id DESC`
          )
          .all(),
        // Deposits with location data (may use earlier version's deposit links)
        db
          .prepare(`SELECT rc.class_name,
                    ml.name as location_name, ml.system, ml.location_type
             FROM mining_location_deposits mld
             JOIN ${t("rock_compositions")} rc ON rc.id = mld.rock_composition_id
             JOIN ${t("mining_locations")} ml ON ml.id = mld.mining_location_id
             WHERE ${classNameFilters}`
          )
          .all(),
        db
          .prepare(`SELECT name, min_quality, max_quality, mean, stddev
             FROM ${t("mining_quality_distributions")}
             WHERE (name LIKE '%ShipMineable%' OR name LIKE '%Mineable%' OR name LIKE '%GroundMineable%')`
          )
          .all(),
      ])

      // Deduplicate compositions: keep latest version per class_name (ordered DESC above)
      const latestCompositions = new Map<
        string,
        string
      >()
      for (const comp of compositionResult.results) {
        const cn = comp.class_name as string
        if (!latestCompositions.has(cn)) {
          latestCompositions.set(cn, comp.composition_json as string)
        }
      }

      // Build location map: class_name → unique locations
      const locationsByClass = new Map<
        string,
        Array<{ location_name: string; system: string; location_type: string }>
      >()
      for (const dep of depositLocResult.results) {
        const cn = dep.class_name as string
        if (!locationsByClass.has(cn)) locationsByClass.set(cn, [])
        const locs = locationsByClass.get(cn)!
        const locName = dep.location_name as string
        // Deduplicate by location name within a class_name
        if (!locs.some((l) => l.location_name === locName)) {
          locs.push({
            location_name: locName,
            system: dep.system as string,
            location_type: dep.location_type as string,
          })
        }
      }

      // Build quality distribution lookup: { "Common_Default": {...}, "Common_Pyro": {...} }
      const qualityMap = new Map<string, Record<string, unknown>>()
      for (const q of qualityResult.results) {
        const name = q.name as string
        // Extract tier + system from names like "CommonShipMineable_QualityDistribution_Default"
        // or "CommonShipMineable_QualityOverride_Pyro"
        const tierMatch = name.match(
          /^(Common|Uncommon|Rare|Epic|Legendary)ShipMineable_Quality(?:Distribution|Override)_(\w+)$/
        )
        if (tierMatch) {
          qualityMap.set(`${tierMatch[1]}_${tierMatch[2]}`, {
            min_quality: q.min_quality,
            max_quality: q.max_quality,
            mean: q.mean,
            stddev: q.stddev,
          })
        }
      }

      // Element name → crafting resource name mapping
      const elementToResource = (element: string): string | null => {
        // Strip _ore / _raw suffix
        const base = element.replace(/_(ore|raw)$/, "")
        // Handle naming mismatches between mining elements and crafting resources
        const nameMap: Record<string, string> = {
          aluminium: "aluminum",
          sileron: "stileron",
        }
        const name = nameMap[base] ?? base
        // Capitalize first letter
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1)
        // Verify it's a known crafting resource
        const knownResources = new Set(
          resResult.results.map((r) => r.name as string)
        )
        return knownResources.has(capitalized) ? capitalized : null
      }

      // Build resource_locations: { "Aluminum": [{ location, system, type, rock_tier, quality }] }
      type LocationEntry = {
        location: string
        system: string
        type: string
        rock_tier: string
        element_pct: { min: number; max: number }
        quality: Record<string, unknown> | null
      }
      const resourceLocations: Record<string, LocationEntry[]> = {}

      // Iterate latest compositions and match to locations by class_name
      for (const [className, compositionJson] of latestCompositions) {
        if (!compositionJson) continue

        // Extract rock tier from class_name
        // 4.6 format: "CommonShipMineables_Default" → "Common"
        // 4.7 format: "Asteroid_CType_Aluminium" → use Common as default
        // Ground deposits: "ShaleDeposit_Iron" → "Ground"
        const tierMatch = className.match(
          /^(Common|Uncommon|Rare|Epic|Legendary)ShipMineables/
        )
        const isAsteroid = /^Asteroid_/.test(className)
        const isGroundDeposit = /Deposit/.test(className)
        if (!tierMatch && !isAsteroid && !isGroundDeposit) continue
        const tier = tierMatch
          ? tierMatch[1]
          : isGroundDeposit
            ? "Ground"
            : "Common"

        // Parse composition to find elements
        let elements: {
          element: string
          minPct: number
          maxPct: number
          probability?: number
        }[]
        try {
          elements = JSON.parse(compositionJson)
        } catch {
          continue
        }

        // Get locations for this class_name (may come from an earlier version)
        const locations = locationsByClass.get(className)
        if (!locations || locations.length === 0) continue

        for (const loc of locations) {
          // Get quality distribution for this tier + location system
          const qualityKey =
            loc.system === "Pyro" ? `${tier}_Pyro` : `${tier}_Default`
          const quality = qualityMap.get(qualityKey) ?? null

          for (const el of elements) {
            const resourceName = elementToResource(el.element)
            if (!resourceName) continue

            if (!resourceLocations[resourceName])
              resourceLocations[resourceName] = []

            // Deduplicate: same resource + location + tier + element_pct
            const existing = resourceLocations[resourceName].find(
              (e) =>
                e.location === loc.location_name &&
                e.rock_tier === tier &&
                e.element_pct.min === el.minPct &&
                e.element_pct.max === el.maxPct
            )
            if (!existing) {
              resourceLocations[resourceName].push({
                location: loc.location_name,
                system: loc.system,
                type: loc.location_type,
                rock_tier: tier,
                element_pct: { min: el.minPct, max: el.maxPct },
                quality,
              })
            }
          }
        }
      }

      return {
        blueprints,
        properties: propResult.results,
        resources: resResult.results.map((r) => r.name),
        resource_locations: resourceLocations,
      }
    })
  })

  // GET /api/gamedata/mission/:key — contract generator detail with blueprint pools
  app.get("/mission/:key", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    const key = c.req.param("key")
    return cachedJson(c, `gd:mission:${cacheSlug(key)}`, async () => {
      // Get generator
      const gen = await db.prepare(`SELECT * FROM ${t("contract_generators")} WHERE generator_key = ? ORDER BY id DESC LIMIT 1`
      ).bind(key).first()
      if (!gen) return null

      const genId = gen.id as number

      // Get careers
      const careers = await db.prepare(`SELECT * FROM ${t("contract_generator_careers")} WHERE contract_generator_id = ? ORDER BY system, debug_name`
      ).bind(genId).all()

      // Get contracts for all careers
      const careerIds = careers.results.map(c => c.id as number)
      const contracts = careerIds.length > 0
        ? await db.prepare(`SELECT * FROM ${t("contract_generator_contracts")} WHERE career_id IN (${careerIds.join(",")}) ORDER BY career_id, difficulty`
          ).all()
        : { results: [] }

      // Get blueprint pools for all contracts
      const contractIds = contracts.results.map(c => c.id as number)
      const bpPools = contractIds.length > 0
        ? await db.prepare(`SELECT cgbp.contract_generator_contract_id, cgbp.chance,
                    rp.key as pool_key, rp.name as pool_name,
                    rpi.crafting_blueprint_id, cb.name as blueprint_name,
                    COALESCE(fw.name, fa.name, fh.name, fam.name) as item_name,
                    cb.type as blueprint_type, cb.sub_type as blueprint_sub_type
             FROM ${t("contract_generator_blueprint_pools")} cgbp
             JOIN ${t("crafting_blueprint_reward_pools")} rp ON rp.id = cgbp.crafting_blueprint_reward_pool_id
             JOIN ${t("crafting_blueprint_reward_pool_items")} rpi ON rpi.crafting_blueprint_reward_pool_id = rp.id
             JOIN ${t("crafting_blueprints")} cb ON cb.id = rpi.crafting_blueprint_id
             LEFT JOIN ${t("fps_weapons")} fw ON fw.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
             LEFT JOIN ${t("fps_armour")} fa ON fa.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
             LEFT JOIN ${t("fps_helmets")} fh ON fh.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
             LEFT JOIN ${t("fps_ammo_types")} fam ON fam.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
             WHERE cgbp.contract_generator_contract_id IN (${contractIds.join(",")})`
          ).all()
        : { results: [] }

      // Group bp pools by contract
      const bpByContract = new Map<number, Record<string, unknown>[]>()
      for (const row of bpPools.results) {
        const cid = row.contract_generator_contract_id as number
        if (!bpByContract.has(cid)) bpByContract.set(cid, [])
        bpByContract.get(cid)!.push(row)
      }

      // Group contracts by career
      const contractsByCareer = new Map<number, Record<string, unknown>[]>()
      for (const c of contracts.results) {
        const cid = c.career_id as number
        if (!contractsByCareer.has(cid)) contractsByCareer.set(cid, [])
        const pools = bpByContract.get(c.id as number) || []
        // Group by pool_key
        const poolMap = new Map<string, { pool_key: string; pool_name: string; chance: number; blueprints: { id: number; name: string; type: string; sub_type: string }[] }>()
        for (const p of pools) {
          const pk = p.pool_key as string
          if (!poolMap.has(pk)) {
            poolMap.set(pk, { pool_key: pk, pool_name: p.pool_name as string, chance: p.chance as number, blueprints: [] })
          }
          poolMap.get(pk)!.blueprints.push({
            id: p.crafting_blueprint_id as number,
            name: p.blueprint_name as string,
            type: p.blueprint_type as string,
            sub_type: p.blueprint_sub_type as string,
          })
        }
        contractsByCareer.get(cid)!.push({
          ...c,
          blueprint_pools: [...poolMap.values()],
        })
      }

      // Collect all unique blueprints across all contracts
      const allBlueprints = new Map<number, { id: number; name: string; type: string; sub_type: string }>()
      for (const row of bpPools.results) {
        const id = row.crafting_blueprint_id as number
        if (!allBlueprints.has(id)) {
          allBlueprints.set(id, {
            id,
            name: (row.item_name as string) || (row.blueprint_name as string),
            type: row.blueprint_type as string,
            sub_type: row.blueprint_sub_type as string,
          })
        }
      }

      // Compute summary
      const systems = [...new Set(careers.results.map(c => c.system as string).filter(Boolean))]

      // Build difficulty tier table (deduplicated across careers)
      const DIFF_ORDER = ["Intro", "VeryEasy", "Easy", "Medium", "Hard", "VeryHard", "Super"]
      const tierMap = new Map<string, { difficulty: string; min_rank: number; rep_reward: number | null }>()
      for (const c of contracts.results) {
        const diff = c.difficulty as string
        if (!diff || tierMap.has(diff)) continue
        const minMatch = ((c.min_standing as string) || "").match(/rank(\d+)/)
        tierMap.set(diff, {
          difficulty: diff,
          min_rank: minMatch ? parseInt(minMatch[1]) : 0,
          rep_reward: (c.rep_reward as number) || null,
        })
      }
      const tiers = DIFF_ORDER.filter(d => tierMap.has(d)).map(d => tierMap.get(d)!)

      // Look up enriched mission giver data (portrait, bio, etc.)
      const factionSlug = gen.faction_slug as string | null
      let missionGiver: Record<string, unknown> | undefined
      if (factionSlug) {
        const giverRes = await db.prepare(`SELECT mg.biography, mg.occupation, mg.association,
                  mg.portrait_url, mg.is_lawful as giver_is_lawful,
                  mg.allies_json, mg.enemies_json
           FROM ${t("mission_givers")} mg
           WHERE mg.slug = ?
           ORDER BY mg.id DESC LIMIT 1`
        ).bind(factionSlug).all()
        missionGiver = giverRes.results[0] as Record<string, unknown> | undefined
      }

      return {
        generator: {
          key: gen.generator_key,
          display_name: gen.display_name,
          faction_name: gen.faction_name,
          faction_slug: factionSlug,
          guild: gen.guild,
          mission_type: gen.mission_type,
          description: gen.description || null,
          focus: gen.focus || null,
          headquarters: gen.headquarters || null,
          leadership: gen.leadership || null,
          biography: (missionGiver?.biography as string) || null,
          occupation: (missionGiver?.occupation as string) || null,
          association: (missionGiver?.association as string) || null,
          portrait_url: (missionGiver?.portrait_url as string) || null,
          is_lawful: missionGiver?.giver_is_lawful ?? null,
          allies_json: (missionGiver?.allies_json as string) || null,
          enemies_json: (missionGiver?.enemies_json as string) || null,
        },
        systems,
        tiers,
        all_blueprints: [...allBlueprints.values()],
      }
    })
  })

  // GET /api/gamedata/mission-givers — faction cards for the missions listing page
  app.get("/mission-givers", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    return cachedJson(c, `gd:mission-givers`, async () => {
      const rows = await db.prepare(`SELECT cg.generator_key, cg.display_name, cg.faction_name, cg.guild,
                cg.mission_type, cg.focus, cg.description, cg.faction_slug,
                mg.portrait_url as giver_portrait_url,
                mg.biography as giver_biography,
                GROUP_CONCAT(DISTINCT cgca.system) as systems_csv,
                COUNT(DISTINCT rpi.crafting_blueprint_id) as blueprint_count
         FROM ${t("contract_generators")} cg
         LEFT JOIN ${t("contract_generator_careers")} cgca ON cgca.contract_generator_id = cg.id
         LEFT JOIN ${t("contract_generator_contracts")} cgc ON cgc.career_id = cgca.id
         LEFT JOIN ${t("contract_generator_blueprint_pools")} cgbp ON cgbp.contract_generator_contract_id = cgc.id
         LEFT JOIN ${t("crafting_blueprint_reward_pool_items")} rpi ON rpi.crafting_blueprint_reward_pool_id = cgbp.crafting_blueprint_reward_pool_id
         LEFT JOIN ${t("mission_givers")} mg ON mg.slug = cg.faction_slug

         GROUP BY cg.id
         ORDER BY blueprint_count DESC, cg.display_name`
      ).all()

      return rows.results.map(r => ({
        generator_key: r.generator_key,
        display_name: r.display_name,
        faction_name: r.faction_name,
        faction_slug: r.faction_slug || null,
        guild: r.guild,
        mission_type: r.mission_type,
        focus: r.focus || null,
        description: r.description || null,
        portrait_url: (r.giver_portrait_url as string) || null,
        biography: (r.giver_biography as string) || null,
        systems: (r.systems_csv as string || "").split(",").filter(Boolean),
        blueprint_count: r.blueprint_count as number,
        has_blueprints: (r.blueprint_count as number) > 0,
      }))
    })
  })

  // GET /api/gamedata/fps-gear — all equippable FPS items for loadout builder
  app.get("/fps-gear", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
return cachedJson(c, `gd:fps-gear`, async () => {
      // Run queries in parallel — avoids D1 query size limit from a 7-table UNION
      // Each query adds category + sub_category matching the in-game filter system
      const [weapons, armour, helmets, clothing, attachments, utilities, melee, carryables] = await Promise.all([
        db.prepare(`SELECT 'weapon' as slot, 'fps_weapons' as source_table,
          'Weapons' as category,
          CASE WHEN w.sub_type = 'Small' THEN 'Sidearms'
               WHEN w.sub_type IN ('Medium','Large') THEN 'Primary'
               WHEN w.sub_type = 'Gadget' THEN 'Special'
               ELSE 'Primary' END as sub_category,
          w.id, w.uuid, w.name, w.class_name, w.sub_type, w.size,
          m.name as manufacturer_name, lm.rarity,
          w.damage, w.dps, w.rounds_per_minute, w.ammo_capacity,
          w.effective_range, w.damage_type, w.fire_modes
          FROM ${t("fps_weapons")} w
          LEFT JOIN ${t("manufacturers")} m ON m.id = w.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_weapon_id = w.id`).all(),
        db.prepare(`SELECT CASE
            WHEN a.sub_type IN ('Arms','arms') THEN 'arms'
            WHEN a.sub_type IN ('Legs','legs') THEN 'legs'
            ELSE 'core' END as slot, 'fps_armour' as source_table,
          'Armor' as category,
          CASE WHEN a.sub_type IN ('Arms','arms') THEN 'Arms'
               WHEN a.sub_type IN ('Legs','legs') THEN 'Legs'
               ELSE 'Core' END as sub_category,
          a.id, a.uuid, a.name, a.class_name, a.sub_type, a.size,
          m.name as manufacturer_name, lm.rarity, a.grade,
          a.resist_physical, a.resist_energy, a.resist_distortion,
          a.resist_thermal, a.resist_biochemical, a.resist_stun
          FROM ${t("fps_armour")} a
          LEFT JOIN ${t("manufacturers")} m ON m.id = a.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_armour_id = a.id`).all(),
        db.prepare(`SELECT 'helmet' as slot, 'fps_helmets' as source_table,
          'Armor' as category, 'Helmets' as sub_category,
          h.id, h.uuid, h.name, h.class_name, h.sub_type, h.size,
          m.name as manufacturer_name, lm.rarity, h.grade,
          h.resist_physical, h.resist_energy, h.resist_distortion,
          h.resist_thermal, h.resist_biochemical, h.resist_stun
          FROM ${t("fps_helmets")} h
          LEFT JOIN ${t("manufacturers")} m ON m.id = h.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_helmet_id = h.id`).all(),
        db.prepare(`SELECT CASE
            WHEN cl.slot = 'Backpack' THEN 'backpack'
            WHEN cl.slot = 'Eyes' THEN 'glasses'
            ELSE 'clothing' END as slot, 'fps_clothing' as source_table,
          CASE WHEN cl.slot = 'Backpack' THEN 'Armor'
               WHEN cl.class_name LIKE '%undersuit%' OR cl.class_name LIKE '%Undersuit%' THEN 'Armor'
               ELSE 'Clothing' END as category,
          CASE WHEN cl.slot = 'Backpack' THEN 'Backpacks'
               WHEN cl.class_name LIKE '%undersuit%' OR cl.class_name LIKE '%Undersuit%' THEN 'Undersuits'
               WHEN cl.slot = 'Hat' THEN 'Headwear'
               WHEN cl.slot = 'Torso_0' THEN 'Shirts'
               WHEN cl.slot = 'Torso_1' THEN 'Jackets'
               WHEN cl.slot = 'Hands' THEN 'Gloves'
               WHEN cl.slot = 'Legs' THEN 'Legwear'
               WHEN cl.slot = 'Feet' THEN 'Footwear'
               WHEN cl.slot = 'Eyes' THEN 'Eyewear'
               ELSE 'Shirts' END as sub_category,
          cl.id, cl.uuid, cl.name, cl.class_name, cl.slot as sub_type, cl.size,
          m.name as manufacturer_name, lm.rarity, cl.grade,
          cl.slot as slot_name
          FROM ${t("fps_clothing")} cl
          LEFT JOIN ${t("manufacturers")} m ON m.id = cl.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_clothing_id = cl.id`).all(),
        db.prepare(`SELECT 'attachment' as slot, 'fps_attachments' as source_table,
          'Utility' as category, 'Attachments' as sub_category,
          at.id, at.uuid, at.name, at.class_name, at.sub_type, at.size,
          m.name as manufacturer_name, lm.rarity
          FROM ${t("fps_attachments")} at
          LEFT JOIN ${t("manufacturers")} m ON m.id = at.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_attachment_id = at.id`).all(),
        db.prepare(`SELECT 'gadget' as slot, 'fps_utilities' as source_table,
          'Utility' as category,
          CASE WHEN u.sub_type IN ('Medical','MedPack') THEN 'Medical'
               WHEN u.sub_type = 'Hacking' THEN 'Cryptokeys'
               WHEN u.sub_type = 'OxygenCap' THEN 'Technology'
               WHEN u.sub_type = 'Grenade' THEN 'Throwables'
               ELSE 'Gadgets' END as sub_category,
          u.id, u.uuid, u.name, u.class_name, u.sub_type,
          m.name as manufacturer_name, lm.rarity
          FROM ${t("fps_utilities")} u
          LEFT JOIN ${t("manufacturers")} m ON m.id = u.manufacturer_id
          LEFT JOIN ${t("loot_map")} lm ON lm.fps_utility_id = u.id`).all(),
        db.prepare(`SELECT 'melee' as slot, 'fps_melee' as source_table,
          'Weapons' as category, 'Melee' as sub_category,
          me.id, me.uuid, me.name, me.class_name, me.sub_type, me.size,
          m.name as manufacturer_name, me.damage, me.damage_type
          FROM ${t("fps_melee")} me
          LEFT JOIN ${t("manufacturers")} m ON m.id = me.manufacturer_id`).all(),
        db.prepare(`SELECT 'carryable' as slot, 'fps_carryables' as source_table,
          CASE WHEN ca.sub_type IN ('Drink','Bar','Bottle','Glass','Can','Sachet') THEN 'Sustenance'
               WHEN ca.sub_type IN ('Consumable','Small','Tin') THEN 'Consumables'
               WHEN ca.sub_type IN ('Cargo','Box') THEN 'Container'
               WHEN ca.sub_type = 'Mission' THEN 'Missions'
               WHEN ca.sub_type = 'Grenade' THEN 'Weapons'
               WHEN ca.sub_type = 'Hacking' THEN 'Utility'
               WHEN ca.sub_type = 'Utility' THEN 'Utility'
               ELSE 'Other' END as category,
          CASE WHEN ca.sub_type IN ('Drink','Bar','Bottle','Glass','Can','Sachet') THEN 'All'
               WHEN ca.sub_type IN ('Consumable','Small','Tin') THEN 'All'
               WHEN ca.sub_type = 'Cargo' THEN 'Commodity Cargo'
               WHEN ca.sub_type = 'Box' THEN 'Loot Crate'
               WHEN ca.sub_type = 'Mission' THEN 'All'
               WHEN ca.sub_type = 'Grenade' THEN 'Throwables'
               WHEN ca.sub_type = 'Hacking' THEN 'Cryptokeys'
               WHEN ca.sub_type = 'Utility' THEN 'Gadgets'
               ELSE 'All' END as sub_category,
          ca.id, ca.uuid, ca.name, ca.class_name, ca.sub_type, NULL as size,
          NULL as manufacturer_name, NULL as rarity
          FROM ${t("fps_carryables")} ca
          `).all(),
      ])

      // Reclassify grenades from Utility to Weapons/Throwables
      for (const item of utilities.results) {
        if (item.sub_category === 'Throwables') {
          item.category = 'Weapons'
        }
      }

      const items = [
        ...weapons.results, ...armour.results, ...helmets.results,
        ...clothing.results, ...attachments.results, ...utilities.results,
        ...melee.results, ...carryables.results,
      ].sort((a, b) => ((a.name as string) ?? "").localeCompare((b.name as string) ?? ""))

      return { items, total: items.length }
    })
  })

  // GET /api/gamedata/faction/:slug — unified faction page: generators + pu_missions + contracts
  app.get("/faction/:slug", async (c) => {
    const isPTU = isPTUChannel(getActiveChannel(c));
    const t = (n: string) => resolveTable(n, isPTU);
    const db = c.env.DB
    const slug = c.req.param("slug")
    // Map of giver_name variants → faction_slug
    const GIVER_SLUG_MAP: Record<string, string> = {
      "covalex independent contractors": "covalexshipping",
      "covalex": "covalexshipping",
      "civilian defense force initiative": "cdf",
      "civilian defense force": "cdf",
      "blacjac security": "deadsaints",
      "blacjac": "deadsaints",
      "miles eckhart": "eckhartsecurity",
      "mt protection services": "microtechprotectionservices",
      "tecia pacheco": "twitchgang",
      "tecia \"twitch\" pacheco": "twitchgang",
    }

    return cachedJson(c, `gd:faction:${cacheSlug(slug)}`, async () => {
      // Get all generators for this faction slug
      const generators = await db.prepare(`SELECT * FROM ${t("contract_generators")} WHERE faction_slug = ? ORDER BY mission_type`
      ).bind(slug).all()

      if (generators.results.length === 0) {
        // Check if it's a giver_slug from contracts table
        // or a giver_name from pu_missions — still return pu data
      }

      const firstGen = generators.results[0] as Record<string, unknown> | undefined

      // Get careers, contracts, blueprint pools for each generator
      const genIds = generators.results.map(g => g.id as number)
      let genData: Record<string, unknown>[] = []

      if (genIds.length > 0) {
        const careers = await db.prepare(`SELECT cgca.*, cg.generator_key, cg.mission_type
           FROM ${t("contract_generator_careers")} cgca
           JOIN ${t("contract_generators")} cg ON cg.id = cgca.contract_generator_id
           WHERE cgca.contract_generator_id IN (${genIds.join(",")})
           ORDER BY cg.mission_type, cgca.system`
        ).all()

        const careerIds = careers.results.map(c => c.id as number)
        const contracts = careerIds.length > 0 ? await db.prepare(`SELECT * FROM ${t("contract_generator_contracts")}
           WHERE career_id IN (${careerIds.join(",")}) ORDER BY career_id, difficulty`
        ).all() : { results: [] }

        const contractIds = contracts.results.map(c => c.id as number)
        const bpPools = contractIds.length > 0 ? await db.prepare(`SELECT cgbp.contract_generator_contract_id, cgbp.chance,
                  rp.key as pool_key, rp.name as pool_name,
                  rpi.crafting_blueprint_id, cb.name as blueprint_name,
                  COALESCE(fw.name, fa.name, fh.name, fam.name) as item_name,
                  cb.type as blueprint_type, cb.sub_type as blueprint_sub_type
           FROM ${t("contract_generator_blueprint_pools")} cgbp
           JOIN ${t("crafting_blueprint_reward_pools")} rp ON rp.id = cgbp.crafting_blueprint_reward_pool_id
           JOIN ${t("crafting_blueprint_reward_pool_items")} rpi ON rpi.crafting_blueprint_reward_pool_id = rp.id
           JOIN ${t("crafting_blueprints")} cb ON cb.id = rpi.crafting_blueprint_id
           LEFT JOIN ${t("fps_weapons")} fw ON fw.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
           LEFT JOIN ${t("fps_armour")} fa ON fa.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
           LEFT JOIN ${t("fps_helmets")} fh ON fh.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
           LEFT JOIN ${t("fps_ammo_types")} fam ON fam.class_name = REPLACE(cb.tag, 'BP_CRAFT_', '')
           WHERE cgbp.contract_generator_contract_id IN (${contractIds.join(",")})`
        ).all() : { results: [] }

        // Group into generator summaries
        const DIFF_ORDER = ["Intro", "VeryEasy", "Easy", "Medium", "Hard", "VeryHard", "Super"]
        for (const gen of generators.results) {
          const genCareers = careers.results.filter(c => c.contract_generator_id === gen.id)
          const genCareerIds = new Set(genCareers.map(c => c.id as number))
          const genContracts = contracts.results.filter(c => genCareerIds.has(c.career_id as number))
          const genContractIds = new Set(genContracts.map(c => c.id as number))
          const genBpPools = bpPools.results.filter(p => genContractIds.has(p.contract_generator_contract_id as number))

          // Tiers
          const tierMap = new Map<string, { difficulty: string; min_rank: number; rep_reward: number | null; rep_rewards: { faction_slug: string; amount: number }[] }>()
          for (const c of genContracts) {
            const diff = c.difficulty as string
            if (!diff || tierMap.has(diff)) continue
            const minMatch = ((c.min_standing as string) || "").match(/rank(\d+)/)
            let repRewards: { faction_slug: string; amount: number }[] = []
            try {
              const raw = c.rep_rewards_json as string
              if (raw) repRewards = JSON.parse(raw)
            } catch { /* ignore */ }
            tierMap.set(diff, {
              difficulty: diff,
              min_rank: minMatch ? parseInt(minMatch[1]) : 0,
              rep_reward: (c.rep_reward as number) || null,
              rep_rewards: repRewards,
            })
          }

          // Blueprint pools
          const poolMap = new Map<string, { pool_key: string; pool_name: string; chance: number; blueprints: { id: number; name: string; type: string; sub_type: string }[] }>()
          for (const p of genBpPools) {
            const pk = p.pool_key as string
            if (!poolMap.has(pk)) {
              poolMap.set(pk, { pool_key: pk, pool_name: p.pool_name as string, chance: p.chance as number, blueprints: [] })
            }
            const entry = poolMap.get(pk)!
            const bpId = p.crafting_blueprint_id as number
            if (!entry.blueprints.some(b => b.id === bpId)) {
              entry.blueprints.push({
                id: bpId,
                name: (p.item_name as string) || (p.blueprint_name as string),
                type: p.blueprint_type as string,
                sub_type: p.blueprint_sub_type as string,
              })
            }
          }

          genData.push({
            key: gen.generator_key,
            mission_type: gen.mission_type,
            systems: [...new Set(genCareers.map(c => c.system as string).filter(Boolean))],
            tiers: DIFF_ORDER.filter(d => tierMap.has(d)).map(d => tierMap.get(d)!),
            blueprint_pools: [...poolMap.values()],
          })
        }
      }

      // Get pu_missions for this faction (by giver_name → slug matching)
      const puMissions = await db.prepare(`SELECT m.id, COALESCE(m.title, m.name) as title, m.description,
                COALESCE(NULLIF(m.reward_amount, 0), m.reward_min, 0) as reward_amount, m.reward_currency,
                COALESCE(m.is_lawful, 0) as is_lawful, m.difficulty,
                COALESCE(m.category, m.mission_type) as category,
                m.mission_giver as giver_name,
                m.reputation_reward_size as rep_summary,
                m.rep_fail_summary as rep_fail,
                m.rep_abandon_summary as rep_abandon,
                m.time_limit_minutes, m.max_players, m.can_share, m.once_only,
                m.fail_if_criminal, m.available_in_prison,
                m.wanted_level_min, m.wanted_level_max,
                m.buy_in_amount, m.reward_max, m.has_standing_bonus,
                m.location_ref, m.locality
         FROM ${t("missions")} m
         ORDER BY m.reward_amount DESC`
      ).all()

      // Filter pu_missions to this faction
      const factionPuMissions = puMissions.results.filter(m => {
        const gn = (m.giver_name as string || "").toLowerCase().replace(/[^a-z0-9]/g, "")
        const mapped = GIVER_SLUG_MAP[(m.giver_name as string || "").toLowerCase()] || gn
        return mapped === slug || gn === slug
      })

      // Get prerequisites and rep requirements for the faction's pu_missions
      const factionMissionIds = new Set(factionPuMissions.map(m => m.id as number))
      const [factionPrereqResult, factionRepReqResult] = await Promise.all([
        db.prepare(`SELECT mp.mission_id, m_req.uuid as required_uuid, COALESCE(m_req.title, m_req.name) as required_title
           FROM ${t("mission_prerequisites")} mp
           JOIN ${t("missions")} m_req ON m_req.id = mp.required_mission_id`,
        ).all(),
        db.prepare(`SELECT mrr.mission_id, mrr.faction_slug, mrr.scope_slug,
                  mrr.comparison, mrr.standing_slug
           FROM ${t("mission_reputation_requirements")} mrr`,
        ).all(),
      ])

      // Build prerequisites map filtered to this faction's missions
      const factionPrerequisites: Record<number, { uuid: string; title: string }[]> = {}
      for (const row of factionPrereqResult.results) {
        const mid = row.mission_id as number
        if (!factionMissionIds.has(mid)) continue
        if (!factionPrerequisites[mid]) factionPrerequisites[mid] = []
        factionPrerequisites[mid].push({
          uuid: row.required_uuid as string,
          title: row.required_title as string,
        })
      }

      // Build rep requirements map filtered to this faction's missions
      const factionRepRequirements: Record<number, { faction_slug: string; scope_slug: string; comparison: string; standing_slug: string }[]> = {}
      for (const row of factionRepReqResult.results) {
        const mid = row.mission_id as number
        if (!factionMissionIds.has(mid)) continue
        if (!factionRepRequirements[mid]) factionRepRequirements[mid] = []
        factionRepRequirements[mid].push({
          faction_slug: row.faction_slug as string,
          scope_slug: row.scope_slug as string,
          comparison: row.comparison as string,
          standing_slug: row.standing_slug as string,
        })
      }

      // Get NPC contracts for this faction
      const SLUG_TO_GIVER_SLUG: Record<string, string> = {
        wikelo: "wikelo", ruto: "ruto", gfs: "gfs",
      }
      const contractGiverSlug = SLUG_TO_GIVER_SLUG[slug]
      let npcContracts: Record<string, unknown>[] = []
      if (contractGiverSlug) {
        const contractResult = await db.prepare(`SELECT * FROM ${t("contracts")} WHERE giver_slug = ? AND is_active = 1 ORDER BY sequence_num, id`
        ).bind(contractGiverSlug).all()
        npcContracts = contractResult.results as Record<string, unknown>[]
      }

      // Look up enriched mission giver data (portrait, bio, etc.)
      const giverResult = await db.prepare(`SELECT mg.biography, mg.occupation, mg.association, mg.headquarters as giver_headquarters,
                mg.portrait_url, mg.is_lawful as giver_is_lawful, mg.allies_json, mg.enemies_json
         FROM ${t("mission_givers")} mg
         WHERE mg.slug = ?
         ORDER BY mg.id DESC LIMIT 1`
      ).bind(slug).all()
      const giver = giverResult.results[0] as Record<string, unknown> | undefined

      // Look up reputation ladder: faction → primary scope → standings + perks
      let repLadder: { scope_name: string; standings: { name: string; slug: string | null; min_reputation: number; is_gated: number; perk_description: string | null; perks: { perk_name: string; display_name: string | null; description: string | null }[] }[] } | null = null

      // Find the faction_id via mission_givers (slug match) or factions table directly
      const factionIdResult = await db.prepare(`SELECT f.id as faction_id FROM ${t("factions")} f
         JOIN ${t("mission_givers")} mg ON mg.faction_id = f.id
         WHERE mg.slug = ?
         ORDER BY mg.id DESC LIMIT 1`
      ).bind(slug).all()

      const factionId = factionIdResult.results[0]?.faction_id as number | undefined
      if (factionId) {
        // Get primary reputation scope for this faction
        const scopeResult = await db.prepare(`SELECT rs.id as scope_id, rs.name as scope_name
           FROM ${t("faction_reputation_scopes")} frs
           JOIN ${t("reputation_scopes")} rs ON rs.id = frs.reputation_scope_id
           WHERE frs.faction_id = ? AND frs.is_primary = 1
           LIMIT 1`
        ).bind(factionId).all()

        const scopeRow = scopeResult.results[0]
        if (scopeRow) {
          const scopeId = scopeRow.scope_id as number
          const scopeName = scopeRow.scope_name as string

          // Get standings for this scope
          const standingsResult = await db.prepare(`SELECT rs2.name, rs2.slug, rs2.min_reputation, rs2.is_gated, rs2.perk_description, rs2.id as standing_id
             FROM ${t("reputation_standings")} rs2
             
             WHERE rs2.scope_id = ? AND rs2.name != '<= PLACEHOLDER =>'
             ORDER BY rs2.min_reputation ASC, rs2.sort_order ASC`
          ).bind(scopeId).all()

          // Get perks for each standing
          const standingIds = standingsResult.results.map(s => s.standing_id as number)
          let perksByStanding = new Map<number, { perk_name: string; display_name: string | null; description: string | null }[]>()
          if (standingIds.length > 0) {
            const perksResult = await db.prepare(`SELECT rp.standing_id, rp.perk_name, rp.display_name, rp.description
               FROM ${t("reputation_perks")} rp
               WHERE rp.scope_id = ? AND rp.standing_id IN (${standingIds.join(",")})`
            ).bind(scopeId).all()
            for (const p of perksResult.results) {
              const sid = p.standing_id as number
              if (!perksByStanding.has(sid)) perksByStanding.set(sid, [])
              perksByStanding.get(sid)!.push({
                perk_name: p.perk_name as string,
                display_name: (p.display_name as string) || null,
                description: (p.description as string) || null,
              })
            }
          }

          repLadder = {
            scope_name: scopeName,
            standings: standingsResult.results.map(s => ({
              name: s.name as string,
              slug: (s.slug as string) || null,
              min_reputation: s.min_reputation as number,
              is_gated: s.is_gated as number,
              perk_description: (s.perk_description as string) || null,
              perks: perksByStanding.get(s.standing_id as number) || [],
            })),
          }
        }
      }

      // Build faction info from first generator or pu_mission giver
      const factionInfo = firstGen ? {
        slug,
        display_name: firstGen.display_name,
        faction_name: firstGen.faction_name,
        guild: firstGen.guild,
        mission_type: null,
        description: firstGen.description || null,
        focus: firstGen.focus || null,
        headquarters: firstGen.headquarters || null,
        leadership: firstGen.leadership || null,
        biography: (giver?.biography as string) || null,
        occupation: (giver?.occupation as string) || null,
        association: (giver?.association as string) || null,
        portrait_url: (giver?.portrait_url as string) || null,
        is_lawful: giver?.giver_is_lawful ?? null,
        allies_json: (giver?.allies_json as string) || null,
        enemies_json: (giver?.enemies_json as string) || null,
      } : {
        slug,
        display_name: factionPuMissions[0]?.giver_name || slug,
        faction_name: null,
        guild: null,
        mission_type: null,
        description: null,
        focus: null,
        headquarters: null,
        leadership: null,
        biography: (giver?.biography as string) || null,
        occupation: (giver?.occupation as string) || null,
        association: (giver?.association as string) || null,
        portrait_url: (giver?.portrait_url as string) || null,
        is_lawful: giver?.giver_is_lawful ?? null,
        allies_json: (giver?.allies_json as string) || null,
        enemies_json: (giver?.enemies_json as string) || null,
      }

      const allSystems = [...new Set(genData.flatMap(g => (g as { systems: string[] }).systems))]
      const totalBlueprintCount = genData.reduce((sum, g) => {
        const pools = (g as { blueprint_pools: { blueprints: unknown[] }[] }).blueprint_pools
        return sum + pools.reduce((s, p) => s + p.blueprints.length, 0)
      }, 0)

      if (!firstGen && factionPuMissions.length === 0 && npcContracts.length === 0) {
        return null
      }

      return {
        faction: factionInfo,
        systems: allSystems,
        stats: {
          mission_count: genData.length + factionPuMissions.length + npcContracts.length,
          blueprint_count: totalBlueprintCount,
        },
        generators: genData,
        pu_missions: factionPuMissions.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description,
          reward_amount: m.reward_amount,
          reward_currency: m.reward_currency,
          is_lawful: m.is_lawful,
          difficulty: m.difficulty,
          category: m.category,
          rep_summary: m.rep_summary || null,
          rep_fail: m.rep_fail || null,
          rep_abandon: m.rep_abandon || null,
          time_limit_minutes: m.time_limit_minutes ?? null,
          max_players: m.max_players ?? null,
          can_share: m.can_share ?? null,
          once_only: m.once_only ?? null,
          fail_if_criminal: m.fail_if_criminal ?? null,
          available_in_prison: m.available_in_prison ?? null,
          wanted_level_min: m.wanted_level_min ?? null,
          wanted_level_max: m.wanted_level_max ?? null,
          buy_in_amount: m.buy_in_amount ?? null,
          reward_max: m.reward_max ?? null,
          has_standing_bonus: m.has_standing_bonus ?? null,
          location_ref: m.location_ref || null,
          locality: m.locality || null,
        })),
        contracts: npcContracts.map(c => ({
          id: c.id,
          title: c.title,
          description: c.description,
          reward_amount: c.reward_amount,
          reward_text: c.reward_text,
          category: c.category,
          requirements_json: c.requirements_json,
        })),
        prerequisites: factionPrerequisites,
        rep_requirements: factionRepRequirements,
        rep_ladder: repLadder,
      }
    })
  })

  return app
}
