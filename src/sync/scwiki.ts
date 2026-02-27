/**
 * SC Wiki API client + sync logic — ported from internal/scwiki/
 *
 * Primary data source for: manufacturers, game versions, vehicles (specs,
 * dimensions, pricing, status), items (components, FPS weapons, armour, etc.)
 */

import {
  upsertManufacturer,
  upsertGameVersion,
  buildUpsertVehicleStatement,
  buildUpsertPortStatement,
  buildUpsertComponentStatement,
  buildUpsertFPSWeaponStatement,
  buildUpsertFPSArmourStatement,
  buildUpsertFPSAttachmentStatement,
  buildUpsertFPSUtilityStatement,
  insertSyncHistory,
  updateSyncHistory,
  loadManufacturerMaps,
  loadGameVersionMap,
  loadProductionStatusMap,
  loadVehicleMaps,
} from "../db/queries";
import { delay, chunkArray } from "../lib/utils";
import { logEvent } from "../lib/logger";

// --- SC Wiki API Types ---

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

interface APIResponse {
  data: unknown[];
  meta?: PaginationMeta;
}

interface SCWikiManufacturer {
  uuid: string;
  name: string;
  code: string;
  slug: string;
  known_for: string;
  description: string;
  logo_url: string;
}

interface SCWikiGameVersion {
  uuid: string;
  code: string;
  channel: string;
  is_default: boolean;
  released_at: string | null;
}

interface LocalizedString {
  en_EN: string;
}

interface SCWikiVehicle {
  uuid: string;
  class_name: string;
  name: string;
  slug: string;
  manufacturer?: SCWikiManufacturer;
  size_class: number;
  career: string;
  role: string;
  is_vehicle: boolean;
  is_gravlev: boolean;
  is_spaceship: boolean;
  mass_total: number;
  cargo_capacity: number;
  vehicle_inventory: number;
  crew?: { min: number; max: number };
  speed?: { scm: number; max: number };
  sizes?: { length: number; beam: number; height: number };
  msrp: number;
  pledge_url: string;
  production_status?: LocalizedString;
  description?: LocalizedString;
  size?: LocalizedString;
  foci?: LocalizedString[];
  health: number;
  shield_hp: number;
  game_version?: SCWikiGameVersion;
  ports?: SCWikiPort[];
  loaner?: { uuid: string; name: string; slug: string }[];
  skus?: { title: string; price: number; available: boolean }[];
}

interface SCWikiPort {
  uuid: string;
  name: string;
  category_label: string;
  size_min: number;
  size_max: number;
  port_type: string;
  equipped_item?: SCWikiItem;
}

interface SCWikiItem {
  uuid: string;
  class_name: string;
  name: string;
  slug: string;
  manufacturer?: SCWikiManufacturer;
  type: string;
  sub_type: string;
  size: number;
  grade: string | number;
  game_version?: SCWikiGameVersion;
}

// --- Rate-limited HTTP client ---

const SC_WIKI_BASE_URL = "https://api.star-citizen.wiki";
const USER_AGENT = "Fleet-Manager/1.0";

const MAX_RETRIES = 3;

async function scwikiFetch(path: string, rateLimitMs: number, attempt = 0): Promise<unknown> {
  await delay(rateLimitMs);

  const url = SC_WIKI_BASE_URL + path;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (resp.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`SC Wiki rate limited (429) after ${MAX_RETRIES} retries on ${path}`);
    }
    const retryAfter = parseInt(resp.headers.get("Retry-After") ?? "5", 10);
    await delay(retryAfter * 1000);
    return scwikiFetch(path, rateLimitMs, attempt + 1);
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`SC Wiki API error (${resp.status}): ${body.slice(0, 200)}`);
  }

  return resp.json();
}

async function fetchPaginated(path: string, rateLimitMs: number, pageSize = 100): Promise<unknown[]> {
  const allData: unknown[] = [];
  let page = 1;

  for (;;) {
    const separator = path.includes("?") ? "&" : "?";
    const pagePath = `${path}${separator}page[number]=${page}&page[size]=${pageSize}`;

    const response = (await scwikiFetch(pagePath, rateLimitMs)) as APIResponse;
    if (!response.data || response.data.length === 0) break;

    allData.push(...response.data);

    if (response.meta && page >= response.meta.last_page) break;
    page++;
  }

  return allData;
}

import { SYNC_SOURCE } from "../lib/constants";

// --- Sync Functions ---

/** Sync manufacturers, game versions, and vehicles (runs in ~15s on Workers). */
export async function syncVehicleData(db: D1Database, rateLimitMs = 1000): Promise<void> {
  console.log("[scwiki] Starting vehicle data sync");
  const start = Date.now();

  await syncManufacturers(db, rateLimitMs);

  try {
    await syncGameVersions(db, rateLimitMs);
  } catch (err) {
    console.warn("[scwiki] Game version sync failed (non-fatal):", err);
  }

  await syncVehicles(db, rateLimitMs);

  const durationS = (Date.now() - start) / 1000;
  console.log(`[scwiki] Vehicle data sync complete in ${durationS.toFixed(1)}s`);
}

/** Sync items (components, FPS weapons, armour, etc.) — separate invocation due to size. */
export async function syncItemData(db: D1Database, rateLimitMs = 1000): Promise<void> {
  console.log("[scwiki] Starting item data sync");
  const start = Date.now();

  // Items are simple paginated reads with batched writes — use a faster rate
  // limit (200ms) since we're just fetching data, not hammering complex endpoints.
  // Vehicle sync stays at the configured rate as it includes heavy includes.
  const itemRateLimitMs = Math.min(rateLimitMs, 200);
  await syncItems(db, itemRateLimitMs);

  const durationS = (Date.now() - start) / 1000;
  console.log(`[scwiki] Item data sync complete in ${durationS.toFixed(1)}s`);
}

/** Full sync (dev/local only — may exceed Workers limits). */
export async function syncAll(db: D1Database, rateLimitMs = 1000): Promise<void> {
  await syncVehicleData(db, rateLimitMs);
  await syncItemData(db, rateLimitMs);
}

async function syncManufacturers(db: D1Database, rateLimitMs: number): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.SCWIKI, "manufacturers", "running");

  try {
    const data = await fetchPaginated("/api/manufacturers", rateLimitMs);
    let count = 0;

    for (const raw of data) {
      const m = raw as SCWikiManufacturer;
      try {
        // Derive slug from name if API doesn't provide it
        const slug = m.slug || m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await upsertManufacturer(db, {
          uuid: m.uuid,
          name: m.name,
          slug,
          code: m.code || "",
          known_for: m.known_for || "",
          description: m.description || "",
          logo_url: m.logo_url || "",
        });
        count++;
      } catch (err) {
        console.warn(`[scwiki] Failed to upsert manufacturer ${m.name}:`, err);
      }
    }

    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(`[scwiki] Manufacturers synced: ${count}`);
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

async function syncGameVersions(db: D1Database, rateLimitMs: number): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.SCWIKI, "game_versions", "running");

  try {
    const data = await fetchPaginated("/api/game-versions", rateLimitMs);
    let count = 0;

    for (const raw of data) {
      const gv = raw as SCWikiGameVersion;
      try {
        // API may not return uuid — use code as fallback UUID
        const uuid = gv.uuid || gv.code;
        await upsertGameVersion(db, {
          uuid,
          code: gv.code,
          channel: gv.channel || "",
          is_default: gv.is_default ?? false,
          released_at: gv.released_at ?? undefined,
        });
        count++;
      } catch (err) {
        console.warn(`[scwiki] Failed to upsert game version ${gv.code}:`, err);
      }
    }

    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(`[scwiki] Game versions synced: ${count}`);
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// Vehicles to permanently exclude from syncing — non-ship entries that SC Wiki
// includes but should not appear in the ship database.
const BLOCKED_VEHICLE_SLUGS = new Set([
  "power-suit",                    // Not a ship — EVA/ground suit equipment
  "dragonfly-star-kitten-edition", // Orphan duplicate — canonical entry is dragonfly-star-kitten
]);

// Vehicles that are cosmetic paint editions rather than distinct ships.
// They are synced to the vehicles table so hangar imports can still match them,
// but marked is_paint_variant=true so ShipDB filters them out.
const PAINT_VARIANT_CLASS_NAMES = new Set([
  "ARGO_ATLS_GEO_Collector_Grad01", // ATLS Snowland Color
  "ARGO_ATLS_GEO_Collector_Grad02", // ATLS Orange Line
  "ARGO_ATLS_GEO_Collector_Grad03", // ATLS Cool Metal Color
]);

async function syncVehicles(db: D1Database, rateLimitMs: number): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.SCWIKI, "vehicles", "running");

  try {
    // Pre-load lookup tables (3 queries total instead of 200+ per-vehicle)
    const [mfgMaps, gvMap, psMap] = await Promise.all([
      loadManufacturerMaps(db),
      loadGameVersionMap(db),
      loadProductionStatusMap(db),
    ]);

    const data = await fetchPaginated(
      "/api/vehicles?include=manufacturer,game_version,ports,loaner",
      rateLimitMs,
    );

    // --- Phase 1: Build all vehicle upsert statements (zero DB cost) ---
    const vehicleStmts: D1PreparedStatement[] = [];
    interface VehicleMeta {
      slug: string;
      loanerSlugs: string[];
      ports: SCWikiPort[];
    }
    const vehicleMeta: VehicleMeta[] = [];

    for (const raw of data) {
      const v = raw as SCWikiVehicle;
      if (BLOCKED_VEHICLE_SLUGS.has(v.slug)) continue;
      try {
        let manufacturerID: number | null = null;
        if (v.manufacturer) {
          manufacturerID = mfgMaps.byUUID.get(v.manufacturer.uuid) ?? null;
          if (manufacturerID === null && v.manufacturer.name) {
            manufacturerID = mfgMaps.byName.get(v.manufacturer.name) ?? null;
          }
        }

        let gameVersionID: number | null = null;
        if (v.game_version) {
          gameVersionID = gvMap.get(v.game_version.uuid) ?? null;
        }

        let vehicleTypeID: number | null = null;
        if (v.is_spaceship) vehicleTypeID = 1;
        else if (v.is_gravlev) vehicleTypeID = 3;
        else if (v.is_vehicle) vehicleTypeID = 2;

        let focus = v.role;
        if (v.foci && v.foci.length > 0 && v.foci[0].en_EN) {
          focus = v.foci[0].en_EN;
        }

        let productionStatusID: number | null = null;
        if (v.production_status?.en_EN) {
          let psKey = v.production_status.en_EN;
          if (psKey === "flight-ready") psKey = "flight_ready";
          else if (psKey === "in-production") psKey = "in_production";
          else if (psKey === "in-concept") psKey = "in_concept";
          productionStatusID = psMap.get(psKey) ?? null;
        }

        vehicleStmts.push(
          buildUpsertVehicleStatement(db, {
            uuid: v.uuid,
            slug: v.slug,
            name: v.name,
            class_name: v.class_name,
            manufacturer_id: manufacturerID ?? undefined,
            vehicle_type_id: vehicleTypeID ?? undefined,
            production_status_id: productionStatusID ?? undefined,
            size_label: v.size?.en_EN ?? "",
            focus,
            classification: v.career,
            description: v.description?.en_EN ?? "",
            length: v.sizes?.length ?? 0,
            beam: v.sizes?.beam ?? 0,
            height: v.sizes?.height ?? 0,
            mass: v.mass_total,
            cargo: v.cargo_capacity,
            vehicle_inventory: v.vehicle_inventory,
            crew_min: v.crew?.min ?? 0,
            crew_max: v.crew?.max ?? 0,
            speed_scm: v.speed?.scm ?? 0,
            speed_max: v.speed?.max ?? 0,
            health: v.health,
            pledge_price: v.msrp,
            on_sale: v.skus?.some((s) => s.available) ?? false,
            is_paint_variant: PAINT_VARIANT_CLASS_NAMES.has(v.class_name),
            pledge_url: v.pledge_url,
            game_version_id: gameVersionID ?? undefined,
          }),
        );

        vehicleMeta.push({
          slug: v.slug,
          loanerSlugs: v.loaner?.filter((l) => l.slug).map((l) => l.slug) ?? [],
          ports: v.ports ?? [],
        });
      } catch (err) {
        console.warn(`[scwiki] Failed to build vehicle statement for ${v.name}:`, err);
      }
    }

    // --- Phase 2: Batch execute all vehicle upserts (~4 batches instead of 576 queries) ---
    for (const chunk of chunkArray(vehicleStmts, 90)) {
      await db.batch(chunk);
    }
    console.log(`[scwiki] Vehicle upserts batched: ${vehicleStmts.length}`);

    // --- Phase 3: Load all vehicle IDs at once (1 query) ---
    const slugToID = (await loadVehicleMaps(db)).bySlug;

    // --- Phase 4: Build and batch loaners + ports ---
    const allLoanerStmts: D1PreparedStatement[] = [];
    const allPortStmts: D1PreparedStatement[] = [];

    for (const meta of vehicleMeta) {
      const vehicleID = slugToID.get(meta.slug);
      if (!vehicleID) continue;

      // Collect loaner statements (DELETE + INSERTs per vehicle, batched together)
      if (meta.loanerSlugs.length > 0) {
        allLoanerStmts.push(
          db.prepare("DELETE FROM vehicle_loaners WHERE vehicle_id = ?").bind(vehicleID),
        );
        for (const slug of meta.loanerSlugs) {
          allLoanerStmts.push(
            db.prepare(
              "INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) SELECT ?, id FROM vehicles WHERE slug = ?",
            ).bind(vehicleID, slug),
          );
        }
      }

      // Collect port statements
      for (const port of meta.ports) {
        allPortStmts.push(
          buildUpsertPortStatement(db, {
            uuid: port.uuid,
            vehicle_id: vehicleID,
            name: port.name,
            category_label: port.category_label,
            size_min: port.size_min,
            size_max: port.size_max,
            port_type: port.port_type,
            equipped_item_uuid: port.equipped_item?.uuid ?? "",
          }),
        );
      }
    }

    // Batch loaners
    for (const chunk of chunkArray(allLoanerStmts, 500)) {
      await db.batch(chunk);
    }

    // Batch ports
    for (const chunk of chunkArray(allPortStmts, 500)) {
      await db.batch(chunk);
    }

    const count = vehicleStmts.length;
    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(
      `[scwiki] Vehicles synced: ${count} (${allLoanerStmts.length} loaner stmts, ${allPortStmts.length} port stmts batched)`,
    );
    logEvent("sync_vehicles", { count, loaners: allLoanerStmts.length, ports: allPortStmts.length });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

async function syncItems(db: D1Database, rateLimitMs: number): Promise<void> {
  const syncID = await insertSyncHistory(db, SYNC_SOURCE.SCWIKI, "items", "running");

  try {
    // Pre-load lookup tables for item sync (same pattern as vehicles)
    const [mfgMaps, gvMap] = await Promise.all([
      loadManufacturerMaps(db),
      loadGameVersionMap(db),
    ]);

    // Filter to only relevant item types server-side (2,864 items vs 19,288 total)
    // This reduces API pages from 97 to ~15, staying within Workers' 50 subrequest limit
    const relevantTypes = [
      ...SHIP_COMPONENTS,
      "WeaponPersonal",
      "Armor", "Helmet", "Undersuit",
      "WeaponAttachment",
      ...FPS_UTILITIES,
    ].join(",");
    const data = await fetchPaginated(
      `/api/items?include=manufacturer,game_version&filter[type]=${relevantTypes}`,
      rateLimitMs,
      200,
    );

    // --- Build all item upsert statements (zero DB cost) ---
    const allStmts: D1PreparedStatement[] = [];

    for (const raw of data) {
      const item = raw as SCWikiItem;
      if (!isRelevantItemType(item.type)) continue;

      try {
        let manufacturerID: number | null = null;
        if (item.manufacturer) {
          manufacturerID = mfgMaps.byUUID.get(item.manufacturer.uuid) ?? null;
          if (manufacturerID === null && item.manufacturer.name) {
            manufacturerID = mfgMaps.byName.get(item.manufacturer.name) ?? null;
          }
        }

        let gameVersionID: number | null = null;
        if (item.game_version) {
          gameVersionID = gvMap.get(item.game_version.uuid) ?? null;
        }

        const stmt = buildItemStatement(db, item, manufacturerID, gameVersionID);
        if (stmt) allStmts.push(stmt);
      } catch (err) {
        console.warn(`[scwiki] Failed to build item statement for ${item.name} (${item.type}):`, err);
      }
    }

    // --- Batch execute all item upserts (500 per chunk to minimize subrequests) ---
    for (const chunk of chunkArray(allStmts, 500)) {
      await db.batch(chunk);
    }

    const count = allStmts.length;
    await updateSyncHistory(db, syncID, "success", count, "");
    console.log(`[scwiki] Items synced: ${count} (batched in ${Math.ceil(count / 90)} chunks)`);
    logEvent("sync_items", { count });
  } catch (err) {
    await updateSyncHistory(db, syncID, "error", 0, String(err));
    throw err;
  }
}

// --- Item routing ---

function buildItemStatement(
  db: D1Database,
  item: SCWikiItem,
  manufacturerID: number | null,
  gameVersionID: number | null,
): D1PreparedStatement | null {
  const grade = String(item.grade ?? "");
  const mfgID = manufacturerID ?? undefined;
  const gvID = gameVersionID ?? undefined;

  if (isShipComponent(item.type)) {
    return buildUpsertComponentStatement(db, {
      uuid: item.uuid,
      name: item.name,
      slug: item.slug,
      class_name: item.class_name,
      manufacturer_id: mfgID,
      type: item.type,
      sub_type: item.sub_type,
      size: item.size,
      grade,
      game_version_id: gvID,
    });
  } else if (item.type === "WeaponPersonal") {
    return buildUpsertFPSWeaponStatement(db, {
      uuid: item.uuid,
      name: item.name,
      slug: item.slug,
      class_name: item.class_name,
      manufacturer_id: mfgID,
      sub_type: item.sub_type,
      size: item.size,
      game_version_id: gvID,
    });
  } else if (isFPSArmour(item.type)) {
    return buildUpsertFPSArmourStatement(db, {
      uuid: item.uuid,
      name: item.name,
      slug: item.slug,
      class_name: item.class_name,
      manufacturer_id: mfgID,
      sub_type: item.sub_type,
      size: item.size,
      grade,
      game_version_id: gvID,
    });
  } else if (item.type === "WeaponAttachment") {
    return buildUpsertFPSAttachmentStatement(db, {
      uuid: item.uuid,
      name: item.name,
      slug: item.slug,
      class_name: item.class_name,
      manufacturer_id: mfgID,
      sub_type: item.sub_type,
      size: item.size,
      game_version_id: gvID,
    });
  } else if (isFPSUtility(item.type)) {
    return buildUpsertFPSUtilityStatement(db, {
      uuid: item.uuid,
      name: item.name,
      slug: item.slug,
      class_name: item.class_name,
      manufacturer_id: mfgID,
      sub_type: item.sub_type,
      game_version_id: gvID,
    });
  }
  return null;
}

const SHIP_COMPONENTS = new Set([
  "WeaponGun",
  "WeaponMissile",
  "TurretBase",
  "PowerPlant",
  "Cooler",
  "QuantumDrive",
  "Shield",
  "ShieldGenerator",
  "MainThruster",
  "ManneuverThruster",
  "QuantumInterdictionGenerator",
  "Radar",
  "Scanner",
  "Avionics",
]);

function isShipComponent(type: string): boolean {
  return SHIP_COMPONENTS.has(type);
}

function isFPSArmour(type: string): boolean {
  return type === "Armor" || type === "Helmet" || type === "Undersuit";
}

const FPS_UTILITIES = new Set(["MedPen", "Gadget", "Grenade", "Backpack"]);

function isFPSUtility(type: string): boolean {
  return FPS_UTILITIES.has(type);
}

function isRelevantItemType(type: string): boolean {
  return (
    isShipComponent(type) ||
    type === "WeaponPersonal" ||
    isFPSArmour(type) ||
    type === "WeaponAttachment" ||
    isFPSUtility(type)
  );
}
