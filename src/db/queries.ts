/**
 * D1 database query functions — ported from internal/database/database.go
 *
 * All queries use D1's prepared statement API: db.prepare(sql).bind(...params)
 * D1 is SQLite-compatible, so we use SQLite syntax throughout.
 */

import type {
  Vehicle,
  Paint,
  UserFleetEntry,
  SyncHistory,
  UserLLMConfig,
  AIAnalysis,
} from "../lib/types";

// --- Nullable helpers (mirror Go's nullableStr/nullableFloat/nullableInt) ---

function n(val: string | undefined | null): string | null {
  return val ?? null;
}

function nNum(val: number | undefined | null): number | null {
  return val ?? null;
}

export async function getAllVehicles(db: D1Database): Promise<Vehicle[]> {
  const result = await db
    .prepare(
      `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
        v.size, v.size_label, v.focus, v.classification, v.description,
        v.length, v.beam, v.height, v.mass, v.cargo,
        v.crew_min, v.crew_max, v.speed_scm, v.pledge_price, v.on_sale,
        v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
        v.pledge_url,
        m.name as manufacturer_name, m.code as manufacturer_code,
        ps.key as production_status
      FROM vehicles v
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
      ORDER BY v.name`,
    )
    .all();
  return result.results as unknown as Vehicle[];
}

export async function getVehicleBySlug(db: D1Database, slug: string): Promise<Vehicle | null> {
  const row = await db
    .prepare(
      `SELECT v.id, v.uuid, v.slug, v.name, v.class_name,
        v.size, v.size_label, v.focus, v.classification, v.description,
        v.length, v.beam, v.height, v.mass, v.cargo,
        v.crew_min, v.crew_max, v.speed_scm, v.pledge_price, v.on_sale,
        v.image_url, v.image_url_small, v.image_url_medium, v.image_url_large,
        v.pledge_url,
        m.name as manufacturer_name, m.code as manufacturer_code,
        ps.key as production_status
      FROM vehicles v
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
      WHERE v.slug = ?`,
    )
    .bind(slug)
    .first();
  return row as unknown as Vehicle | null;
}

export async function getVehicleCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) as count FROM vehicles").first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getVehicleIDBySlug(db: D1Database, slug: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM vehicles WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function getAllVehicleNameSlugs(
  db: D1Database,
): Promise<Array<{ name: string; slug: string }>> {
  const result = await db.prepare("SELECT name, slug FROM vehicles ORDER BY name").all();
  return result.results as Array<{ name: string; slug: string }>;
}

export async function updateVehicleImages(
  db: D1Database,
  slug: string,
  imageURL: string,
  small: string,
  medium: string,
  large: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE vehicles SET
        image_url = ?, image_url_small = ?, image_url_medium = ?, image_url_large = ?,
        updated_at = datetime('now')
      WHERE slug = ?`,
    )
    .bind(imageURL, small, medium, large, slug)
    .run();
}

export async function syncVehicleLoaners(
  db: D1Database,
  vehicleID: number,
  loanerSlugs: string[],
): Promise<void> {
  await db.prepare("DELETE FROM vehicle_loaners WHERE vehicle_id = ?").bind(vehicleID).run();

  for (const slug of loanerSlugs) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) SELECT ?, id FROM vehicles WHERE slug = ?",
      )
      .bind(vehicleID, slug)
      .run();
  }
}

export async function findVehicleIDsBySlugLike(
  db: D1Database,
  pattern: string,
): Promise<number[]> {
  const result = await db
    .prepare("SELECT id FROM vehicles WHERE slug LIKE ?")
    .bind(pattern)
    .all();
  return result.results.map((r) => (r as { id: number }).id);
}

export async function findVehicleIDsBySlugPrefix(
  db: D1Database,
  prefix: string,
): Promise<number[]> {
  const result = await db
    .prepare("SELECT id FROM vehicles WHERE slug LIKE ?")
    .bind(prefix + "%")
    .all();
  return result.results.map((r) => (r as { id: number }).id);
}

export async function findVehicleIDsByNameContains(
  db: D1Database,
  term: string,
): Promise<number[]> {
  const result = await db
    .prepare("SELECT id FROM vehicles WHERE LOWER(name) LIKE ?")
    .bind("%" + term.toLowerCase() + "%")
    .all();
  return result.results.map((r) => (r as { id: number }).id);
}

// ============================================================
// Port Operations
// ============================================================

export async function getShipLoadout(db: D1Database, slug: string): Promise<Record<string, unknown>[]> {
  // Some ships mount weapons inside a weapon-mount bracket (fixed/gimbal). The bracket is
  // the direct equipped item on the gun port, but it is not in vehicle_components. The actual
  // weapon lives one level deeper in a child port. We use a CTE to pre-filter to just this
  // ship's ports, then COALESCE the direct component join with a child-port fallback lookup.
  //
  // port_id and parent_port_id are returned so the frontend can build a hierarchy
  // (e.g. weapon ports nested under their turret housing in the Turrets section).
  const result = await db
    .prepare(
      `WITH ship_ports AS (
        SELECT * FROM vehicle_ports
        WHERE vehicle_id = (SELECT id FROM vehicles WHERE slug = ?)
      ),
      child_components AS (
        SELECT
          c.parent_port_id,
          vc2.name, vc2.type, vc2.sub_type, vc2.size, vc2.grade, vc2.class, vc2.stats_json,
          m2.name AS manufacturer_name, m2.class AS manufacturer_class,
          ROW_NUMBER() OVER (PARTITION BY c.parent_port_id ORDER BY c.id) AS rn
        FROM ship_ports c
        JOIN vehicle_components vc2 ON vc2.uuid = c.equipped_item_uuid
        LEFT JOIN manufacturers m2 ON m2.id = vc2.manufacturer_id
      )
      SELECT
        p.id AS port_id,
        p.parent_port_id,
        p.name AS port_name,
        p.category_label,
        p.port_type,
        p.size_min,
        p.size_max,
        COALESCE(vc.name, child.name) AS component_name,
        COALESCE(vc.type, child.type) AS component_type,
        COALESCE(vc.sub_type, child.sub_type) AS sub_type,
        COALESCE(vc.size, child.size) AS component_size,
        COALESCE(vc.grade, child.grade) AS grade,
        COALESCE(vc.stats_json, child.stats_json) AS stats_json,
        COALESCE(m.name, child.manufacturer_name) AS manufacturer_name,
        COALESCE(vc.class, m.class, child.class, child.manufacturer_class) AS component_class
      FROM ship_ports p
      LEFT JOIN vehicle_components vc ON vc.uuid = p.equipped_item_uuid
      LEFT JOIN manufacturers m ON m.id = vc.manufacturer_id
      LEFT JOIN child_components child ON child.parent_port_id = p.id AND child.rn = 1
      WHERE p.category_label IS NOT NULL
        AND (
          p.parent_port_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM ship_ports pp
            WHERE pp.id = p.parent_port_id
              AND pp.category_label = p.category_label
              AND pp.port_type != 'turret'
          )
        )
      ORDER BY p.category_label, p.name`,
    )
    .bind(slug)
    .all();

  return result.results as Record<string, unknown>[];
}

// ============================================================
// Paint Operations
// ============================================================

export async function upsertPaint(
  db: D1Database,
  p: Partial<Paint> & { name: string },
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO paints (uuid, name, slug, class_name, description,
        image_url, image_url_small, image_url_medium, image_url_large, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(class_name) DO UPDATE SET
        name=excluded.name,
        slug=COALESCE(excluded.slug, paints.slug),
        description=COALESCE(excluded.description, paints.description),
        image_url=COALESCE(excluded.image_url, paints.image_url),
        image_url_small=COALESCE(excluded.image_url_small, paints.image_url_small),
        image_url_medium=COALESCE(excluded.image_url_medium, paints.image_url_medium),
        image_url_large=COALESCE(excluded.image_url_large, paints.image_url_large),
        raw_data=COALESCE(excluded.raw_data, paints.raw_data),
        updated_at=excluded.updated_at`,
    )
    .bind(
      n(p.uuid), p.name, n(p.slug), n(p.class_name), n(p.description),
      n(p.image_url), n(p.image_url_small), n(p.image_url_medium), n(p.image_url_large),
      null,
    )
    .run();

  // Always SELECT — D1's last_row_id is unreliable on upsert UPDATE path
  const row = await db
    .prepare("SELECT id FROM paints WHERE class_name = ?")
    .bind(p.class_name)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export async function getAllPaints(db: D1Database): Promise<Paint[]> {
  const paintResult = await db
    .prepare(
      `SELECT p.id, p.uuid, p.name, p.slug, p.class_name,
        p.description, p.image_url, p.image_url_small, p.image_url_medium, p.image_url_large,
        p.created_at, p.updated_at
      FROM paints p ORDER BY p.name`,
    )
    .all();

  const paints: Paint[] = paintResult.results.map((row) => ({
    ...(row as unknown as Paint),
    vehicles: [],
  }));

  if (paints.length === 0) return paints;

  const paintIdx = new Map<number, number>();
  paints.forEach((p, i) => paintIdx.set(p.id, i));

  const vResult = await db
    .prepare(
      `SELECT pv.paint_id, v.id, v.name, v.slug
      FROM paint_vehicles pv
      JOIN vehicles v ON v.id = pv.vehicle_id
      ORDER BY pv.paint_id, v.name`,
    )
    .all();

  for (const row of vResult.results) {
    const r = row as { paint_id: number; id: number; name: string; slug: string };
    const idx = paintIdx.get(r.paint_id);
    if (idx !== undefined) {
      paints[idx].vehicles.push({ id: r.id, name: r.name, slug: r.slug });
    }
  }

  return paints;
}

export async function getPaintsForVehicle(db: D1Database, vehicleSlug: string): Promise<Paint[]> {
  const paintResult = await db
    .prepare(
      `SELECT p.id, p.uuid, p.name, p.slug, p.class_name,
        p.description, p.image_url, p.image_url_small, p.image_url_medium, p.image_url_large,
        p.created_at, p.updated_at
      FROM paints p
      WHERE p.id IN (
        SELECT pv.paint_id FROM paint_vehicles pv
        JOIN vehicles v ON v.id = pv.vehicle_id
        WHERE v.slug = ?
      )
      ORDER BY p.name`,
    )
    .bind(vehicleSlug)
    .all();

  const paints: Paint[] = paintResult.results.map((row) => ({
    ...(row as unknown as Paint),
    vehicles: [],
  }));

  if (paints.length === 0) return paints;

  const paintIdx = new Map<number, number>();
  paints.forEach((p, i) => paintIdx.set(p.id, i));

  const paintIDs = paints.map((p) => p.id);
  const placeholders = paintIDs.map(() => "?").join(",");
  const vResult = await db
    .prepare(
      `SELECT pv.paint_id, v.id, v.name, v.slug
      FROM paint_vehicles pv
      JOIN vehicles v ON v.id = pv.vehicle_id
      WHERE pv.paint_id IN (${placeholders})
      ORDER BY pv.paint_id, v.name`,
    )
    .bind(...paintIDs)
    .all();

  for (const row of vResult.results) {
    const r = row as { paint_id: number; id: number; name: string; slug: string };
    const idx = paintIdx.get(r.paint_id);
    if (idx !== undefined) {
      paints[idx].vehicles.push({ id: r.id, name: r.name, slug: r.slug });
    }
  }

  return paints;
}

export async function getPaintCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) as count FROM paints").first<{ count: number }>();
  return row?.count ?? 0;
}

export async function updatePaintImages(
  db: D1Database,
  className: string,
  imageURL: string,
  small: string,
  medium: string,
  large: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE paints SET
        image_url = ?, image_url_small = ?, image_url_medium = ?, image_url_large = ?,
        updated_at = datetime('now')
      WHERE class_name = ?`,
    )
    .bind(imageURL, small, medium, large, className)
    .run();
}

export async function getAllPaintNameClasses(
  db: D1Database,
): Promise<Array<{ name: string; class_name: string; has_image: boolean }>> {
  const result = await db
    .prepare(
      `SELECT name, class_name, (image_url IS NOT NULL AND image_url != '') as has_image
      FROM paints ORDER BY name`,
    )
    .all();
  return result.results as Array<{ name: string; class_name: string; has_image: boolean }>;
}

export async function getPaintsByVehicleSlug(
  db: D1Database,
  vehicleSlug: string,
): Promise<Array<{ name: string; class_name: string }>> {
  const result = await db
    .prepare(
      `SELECT p.name, p.class_name
      FROM paints p
      JOIN paint_vehicles pv ON pv.paint_id = p.id
      JOIN vehicles v ON v.id = pv.vehicle_id
      WHERE v.slug = ?
      ORDER BY p.name`,
    )
    .bind(vehicleSlug)
    .all();
  return result.results as Array<{ name: string; class_name: string }>;
}

export async function getVehicleSlugsWithPaints(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT v.slug
      FROM paint_vehicles pv
      JOIN vehicles v ON v.id = pv.vehicle_id
      ORDER BY v.slug`,
    )
    .all();
  return result.results.map((r) => (r as { slug: string }).slug);
}

// ============================================================
// User Fleet Operations
// ============================================================

export async function insertUserFleetEntry(
  db: D1Database,
  entry: Partial<UserFleetEntry> & { user_id: number; vehicle_id: number },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
        pledge_id, pledge_name, pledge_cost, pledge_date, custom_name, equipped_paint_id, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      entry.user_id, entry.vehicle_id, nNum(entry.insurance_type_id),
      entry.warbond ? 1 : 0, entry.is_loaner ? 1 : 0,
      n(entry.pledge_id), n(entry.pledge_name), n(entry.pledge_cost),
      n(entry.pledge_date), n(entry.custom_name), nNum(entry.equipped_paint_id),
    )
    .run();

  return result.meta.last_row_id ?? 0;
}

export async function clearUserFleet(db: D1Database, userID: number): Promise<void> {
  await db.prepare("DELETE FROM user_fleet WHERE user_id = ?").bind(userID).run();
}

export async function getUserFleetCount(db: D1Database, userID: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM user_fleet WHERE user_id = ?")
    .bind(userID)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getUserFleet(db: D1Database, userID: number): Promise<UserFleetEntry[]> {
  const result = await db
    .prepare(
      `SELECT uf.id, uf.user_id, uf.vehicle_id, uf.insurance_type_id, uf.warbond, uf.is_loaner,
        uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
        uf.equipped_paint_id, uf.imported_at,
        v.name as vehicle_name, v.slug as vehicle_slug, v.image_url, v.focus, v.size_label, v.cargo,
        v.crew_min, v.crew_max, v.pledge_price, v.speed_scm, v.classification,
        m.name as manufacturer_name, m.code as manufacturer_code,
        it.label as insurance_label, it.duration_months, it.is_lifetime,
        p.name as paint_name,
        ps.key as production_status
      FROM user_fleet uf
      JOIN vehicles v ON v.id = uf.vehicle_id
      LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
      LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
      LEFT JOIN paints p ON p.id = uf.equipped_paint_id
      LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
      WHERE uf.user_id = ?
      ORDER BY v.name`,
    )
    .bind(userID)
    .all();

  return result.results as unknown as UserFleetEntry[];
}

// ============================================================
// Insurance Type Operations
// ============================================================

export async function getInsuranceTypeIDByKey(db: D1Database, key: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM insurance_types WHERE key = ?")
    .bind(key)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function loadInsuranceTypes(db: D1Database): Promise<Map<string, number>> {
  const result = await db.prepare("SELECT id, key FROM insurance_types").all();
  const map = new Map<string, number>();
  for (const row of result.results) {
    const r = row as { id: number; key: string };
    map.set(r.key, r.id);
  }
  return map;
}

// ============================================================
// Sync History Operations
// ============================================================

export async function insertSyncHistory(
  db: D1Database,
  sourceID: number,
  endpoint: string,
  status: string,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO sync_history (source_id, endpoint, status, started_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    )
    .bind(sourceID, endpoint, status)
    .run();
  return result.meta.last_row_id ?? 0;
}

export async function updateSyncHistory(
  db: D1Database,
  id: number,
  status: string,
  count: number,
  errMsg: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE sync_history SET status = ?, record_count = ?, error_message = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    )
    .bind(status, count, errMsg || null, id)
    .run();
}

export async function getLatestSyncHistory(db: D1Database): Promise<SyncHistory[]> {
  const result = await db
    .prepare(
      `SELECT sh.id, sh.source_id, sh.endpoint, sh.status, sh.record_count,
        sh.error_message, sh.started_at, sh.completed_at,
        ss.label as source_label
      FROM sync_history sh
      LEFT JOIN sync_sources ss ON ss.id = sh.source_id
      ORDER BY sh.started_at DESC LIMIT 10`,
    )
    .all();
  return result.results as unknown as SyncHistory[];
}

// ============================================================
// User LLM Config Operations
// ============================================================

export async function getUserLLMConfig(db: D1Database, userID: number): Promise<UserLLMConfig | null> {
  const row = await db
    .prepare("SELECT id, user_id, provider, encrypted_api_key, model FROM user_llm_configs WHERE user_id = ? LIMIT 1")
    .bind(userID)
    .first();
  return row as unknown as UserLLMConfig | null;
}

export async function upsertUserLLMConfig(
  db: D1Database,
  userID: number,
  provider: string,
  encryptedKey: string,
  model: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_llm_configs (user_id, provider, encrypted_api_key, model, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, provider) DO UPDATE SET
        encrypted_api_key=excluded.encrypted_api_key,
        model=excluded.model,
        updated_at=excluded.updated_at`,
    )
    .bind(userID, provider, encryptedKey, model)
    .run();
}

export async function clearUserLLMConfigs(db: D1Database, userID: number): Promise<void> {
  await db.prepare("DELETE FROM user_llm_configs WHERE user_id = ?").bind(userID).run();
}

// ============================================================
// AI Analysis Operations
// ============================================================

export async function saveAIAnalysis(
  db: D1Database,
  userID: number,
  provider: string,
  model: string,
  vehicleCount: number,
  analysis: string,
): Promise<number> {
  const result = await db
    .prepare("INSERT INTO ai_analyses (user_id, provider, model, vehicle_count, analysis) VALUES (?, ?, ?, ?, ?)")
    .bind(userID, provider, model, vehicleCount, analysis)
    .run();
  return result.meta.last_row_id ?? 0;
}

export async function getLatestAIAnalysis(db: D1Database, userID: number): Promise<AIAnalysis | null> {
  const row = await db
    .prepare(
      "SELECT id, user_id, created_at, provider, model, vehicle_count, analysis FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userID)
    .first();
  return row as unknown as AIAnalysis | null;
}

export async function getAIAnalysisHistory(db: D1Database, userID: number, limit = 50): Promise<AIAnalysis[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, created_at, provider, model, vehicle_count, analysis
      FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userID, limit)
    .all();
  return result.results as unknown as AIAnalysis[];
}

export async function deleteAIAnalysis(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM ai_analyses WHERE id = ?").bind(id).run();
}

// ============================================================
// Loot Map Operations
// ============================================================

export interface LootItem {
  id: number;
  uuid: string;
  name: string;
  type: string | null;
  sub_type: string | null;
  rarity: string | null;
  category: string;
  has_containers: number;
  has_shops: number;
  has_npcs: number;
  has_corpses: number;
  has_contracts: number;
  manufacturer_name: string | null;
}

export interface WishlistItem extends LootItem {
  shops_json: string | null;
  containers_json: string | null;
  npcs_json: string | null;
  corpses_json: string | null;
  contracts_json: string | null;
  wishlist_quantity: number;
}

export interface CollectionEntry {
  loot_map_id: number;
  quantity: number;
}

export async function getGameVersions(db: D1Database): Promise<{ code: string; channel: string; is_default: number; released_at: string }[]> {
  const result = await db
    .prepare("SELECT code, channel, is_default, released_at FROM game_versions ORDER BY released_at DESC")
    .all<{ code: string; channel: string; is_default: number; released_at: string }>();
  return result.results;
}

export async function getLootItems(db: D1Database, patchCode?: string): Promise<LootItem[]> {
  const versionFilter = patchCode
    ? `lm.game_version_id = (SELECT id FROM game_versions WHERE code = ?)`
    : `lm.game_version_id = (SELECT id FROM game_versions WHERE is_default = 1)`;
  // Manufacturer is resolved via a single CASE subquery per row instead of 16 LEFT JOINs.
  // Only the matching FK branch executes — each is a PK lookup + FK join.
  const sql = `SELECT lb.id, lb.uuid, lb.name, lb.type, lb.sub_type, lb.rarity,
        lb.category, lb.has_containers, lb.has_shops, lb.has_npcs, lb.has_corpses, lb.has_contracts,
        CASE
          WHEN lb.mfr_raw IN ('<= PLACEHOLDER =>', '987') OR lb.mfr_raw LIKE '@%' THEN NULL
          ELSE lb.mfr_raw
        END as manufacturer_name
      FROM (
        SELECT
          lm.id, lm.uuid, lm.name, lm.type, lm.sub_type, lm.rarity,
          ${LOOT_CATEGORY_CASE} as category,
          CASE WHEN lm.containers_json NOT IN ('null','[]','') AND lm.containers_json IS NOT NULL THEN 1 ELSE 0 END as has_containers,
          CASE WHEN lm.shops_json     NOT IN ('null','[]','') AND lm.shops_json IS NOT NULL     THEN 1 ELSE 0 END as has_shops,
          CASE WHEN lm.npcs_json      NOT IN ('null','[]','') AND lm.npcs_json IS NOT NULL      THEN 1 ELSE 0 END as has_npcs,
          CASE WHEN lm.corpses_json   NOT IN ('null','[]','') AND lm.corpses_json IS NOT NULL   THEN 1 ELSE 0 END as has_corpses,
          CASE WHEN lm.contracts_json NOT IN ('null','[]','') AND lm.contracts_json IS NOT NULL THEN 1 ELSE 0 END as has_contracts,
          CASE
            WHEN lm.fps_weapon_id IS NOT NULL THEN (SELECT m.name FROM fps_weapons t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_weapon_id)
            WHEN lm.fps_armour_id IS NOT NULL THEN (SELECT m.name FROM fps_armour t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_armour_id)
            WHEN lm.fps_attachment_id IS NOT NULL THEN (SELECT m.name FROM fps_attachments t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_attachment_id)
            WHEN lm.fps_utility_id IS NOT NULL THEN (SELECT m.name FROM fps_utilities t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_utility_id)
            WHEN lm.fps_helmet_id IS NOT NULL THEN (SELECT m.name FROM fps_helmets t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_helmet_id)
            WHEN lm.fps_clothing_id IS NOT NULL THEN (SELECT m.name FROM fps_clothing t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_clothing_id)
            WHEN lm.vehicle_component_id IS NOT NULL THEN (SELECT m.name FROM vehicle_components t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.vehicle_component_id)
            WHEN lm.ship_missile_id IS NOT NULL THEN (SELECT m.name FROM ship_missiles t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.ship_missile_id)
          END as mfr_raw
        FROM loot_map lm
        WHERE ${versionFilter}
          AND lm.name NOT IN ('<= PLACEHOLDER =>')
          AND lm.name NOT LIKE 'EntityClassDefinition.%'
          AND lm.type IS NOT NULL AND lm.type != ''
          AND lm.type NOT IN (
            'NOITEM_Vehicle','UNDEFINED',
            'Char_Skin_Color','Char_Head_Hair','Char_Hair_Color',
            'Char_Head_Eyes','Char_Body','Char_Head_Eyelash',
            'Currency','MobiGlas'
          )
      ) lb
      ORDER BY lb.name ASC`;
  const result = await (patchCode ? db.prepare(sql).bind(patchCode) : db.prepare(sql)).all();
  return result.results as unknown as LootItem[];
}

export async function getLootByUuid(db: D1Database, uuid: string, patchCode?: string): Promise<Record<string, unknown> | null> {
  const versionFilter = patchCode
    ? `AND lm.game_version_id = (SELECT id FROM game_versions WHERE code = ?)`
    : `AND lm.game_version_id = (SELECT id FROM game_versions WHERE is_default = 1)`;
  const sql = `SELECT
        lm.*,
        ${LOOT_CATEGORY_CASE} as category
      FROM loot_map lm
      WHERE lm.uuid = ? ${versionFilter}`;
  const row = await (patchCode ? db.prepare(sql).bind(uuid, patchCode) : db.prepare(sql).bind(uuid)).first();
  if (!row) return null;

  // Fetch linked item details based on which FK is set
  const item = row as Record<string, unknown>;
  let details: Record<string, unknown> | null = null;

  if (item.fps_weapon_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, size, description, stats_json FROM fps_weapons WHERE id = ?")
      .bind(item.fps_weapon_id)
      .first() as Record<string, unknown> | null;
  } else if (item.fps_armour_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, size, grade, description, stats_json FROM fps_armour WHERE id = ?")
      .bind(item.fps_armour_id)
      .first() as Record<string, unknown> | null;
  } else if (item.fps_attachment_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, size, description, stats_json FROM fps_attachments WHERE id = ?")
      .bind(item.fps_attachment_id)
      .first() as Record<string, unknown> | null;
  } else if (item.fps_utility_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, description, stats_json FROM fps_utilities WHERE id = ?")
      .bind(item.fps_utility_id)
      .first() as Record<string, unknown> | null;
  } else if (item.fps_helmet_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, size, grade, description, stats_json FROM fps_helmets WHERE id = ?")
      .bind(item.fps_helmet_id)
      .first() as Record<string, unknown> | null;
  } else if (item.fps_clothing_id) {
    details = await db
      .prepare("SELECT name, slot, size, grade, description, stats_json FROM fps_clothing WHERE id = ?")
      .bind(item.fps_clothing_id)
      .first() as Record<string, unknown> | null;
  } else if (item.consumable_id) {
    details = await db
      .prepare("SELECT name, type, sub_type, description FROM consumables WHERE id = ?")
      .bind(item.consumable_id)
      .first() as Record<string, unknown> | null;
  } else if (item.harvestable_id) {
    details = await db
      .prepare("SELECT name, sub_type as type, description FROM harvestables WHERE id = ?")
      .bind(item.harvestable_id)
      .first() as Record<string, unknown> | null;
  } else if (item.props_id) {
    details = await db
      .prepare("SELECT name, type, sub_type, description FROM props WHERE id = ?")
      .bind(item.props_id)
      .first() as Record<string, unknown> | null;
  } else if (item.vehicle_component_id) {
    details = await db
      .prepare("SELECT name, type, sub_type, size, grade, description, stats_json FROM vehicle_components WHERE id = ?")
      .bind(item.vehicle_component_id)
      .first() as Record<string, unknown> | null;
  } else if (item.ship_missile_id) {
    details = await db
      .prepare("SELECT name, type, sub_type, size, grade, description, stats_json FROM ship_missiles WHERE id = ?")
      .bind(item.ship_missile_id)
      .first() as Record<string, unknown> | null;
  }

  return { ...item, item_details: details };
}

export async function getUserLootCollection(db: D1Database, userId: string): Promise<CollectionEntry[]> {
  const result = await db
    .prepare("SELECT loot_map_id, quantity FROM user_loot_collection WHERE user_id = ?")
    .bind(userId)
    .all<CollectionEntry>();
  return result.results;
}

export async function addToLootCollection(db: D1Database, userId: string, lootMapId: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO user_loot_collection (user_id, loot_map_id, quantity) VALUES (?, ?, 1)")
    .bind(userId, lootMapId)
    .run();
}

export async function setLootCollectionQuantity(db: D1Database, userId: string, lootMapId: number, quantity: number): Promise<void> {
  await db
    .prepare("INSERT INTO user_loot_collection (user_id, loot_map_id, quantity) VALUES (?, ?, ?) ON CONFLICT (user_id, loot_map_id) DO UPDATE SET quantity = excluded.quantity")
    .bind(userId, lootMapId, quantity)
    .run();
}

export async function removeFromLootCollection(db: D1Database, userId: string, lootMapId: number): Promise<void> {
  await db
    .prepare("DELETE FROM user_loot_collection WHERE user_id = ? AND loot_map_id = ?")
    .bind(userId, lootMapId)
    .run();
}

export async function getUserLootWishlist(db: D1Database, userId: string): Promise<WishlistItem[]> {
  // Manufacturer resolved via CASE subquery (matches getLootItems pattern) instead of 16 LEFT JOINs.
  const result = await db
    .prepare(
      `SELECT lb.id, lb.uuid, lb.name, lb.type, lb.sub_type, lb.rarity,
        lb.category, lb.has_containers, lb.has_shops, lb.has_npcs, lb.has_corpses, lb.has_contracts,
        CASE
          WHEN lb.mfr_raw IN ('<= PLACEHOLDER =>', '987') OR lb.mfr_raw LIKE '@%' THEN NULL
          ELSE lb.mfr_raw
        END as manufacturer_name,
        lb.shops_json, lb.containers_json, lb.npcs_json, lb.corpses_json, lb.contracts_json,
        lb.wishlist_quantity
      FROM (
        SELECT
          lm.id, lm.uuid, lm.name, lm.type, lm.sub_type, lm.rarity,
          ${LOOT_CATEGORY_CASE} as category,
          CASE WHEN lm.containers_json NOT IN ('null','[]','') AND lm.containers_json IS NOT NULL THEN 1 ELSE 0 END as has_containers,
          CASE WHEN lm.shops_json     NOT IN ('null','[]','') AND lm.shops_json IS NOT NULL     THEN 1 ELSE 0 END as has_shops,
          CASE WHEN lm.npcs_json      NOT IN ('null','[]','') AND lm.npcs_json IS NOT NULL      THEN 1 ELSE 0 END as has_npcs,
          CASE WHEN lm.corpses_json   NOT IN ('null','[]','') AND lm.corpses_json IS NOT NULL   THEN 1 ELSE 0 END as has_corpses,
          CASE WHEN lm.contracts_json NOT IN ('null','[]','') AND lm.contracts_json IS NOT NULL THEN 1 ELSE 0 END as has_contracts,
          CASE
            WHEN lm.fps_weapon_id IS NOT NULL THEN (SELECT m.name FROM fps_weapons t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_weapon_id)
            WHEN lm.fps_armour_id IS NOT NULL THEN (SELECT m.name FROM fps_armour t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_armour_id)
            WHEN lm.fps_attachment_id IS NOT NULL THEN (SELECT m.name FROM fps_attachments t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_attachment_id)
            WHEN lm.fps_utility_id IS NOT NULL THEN (SELECT m.name FROM fps_utilities t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_utility_id)
            WHEN lm.fps_helmet_id IS NOT NULL THEN (SELECT m.name FROM fps_helmets t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_helmet_id)
            WHEN lm.fps_clothing_id IS NOT NULL THEN (SELECT m.name FROM fps_clothing t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.fps_clothing_id)
            WHEN lm.vehicle_component_id IS NOT NULL THEN (SELECT m.name FROM vehicle_components t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.vehicle_component_id)
            WHEN lm.ship_missile_id IS NOT NULL THEN (SELECT m.name FROM ship_missiles t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = lm.ship_missile_id)
          END as mfr_raw,
          lm.shops_json, lm.containers_json, lm.npcs_json, lm.corpses_json, lm.contracts_json,
          ulw.quantity as wishlist_quantity
        FROM user_loot_wishlist ulw
        JOIN loot_map lm ON lm.id = ulw.loot_map_id
        WHERE ulw.user_id = ?
      ) lb
      ORDER BY lb.name ASC`,
    )
    .bind(userId)
    .all();
  return result.results as unknown as WishlistItem[];
}

export async function addToLootWishlist(db: D1Database, userId: string, lootMapId: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO user_loot_wishlist (user_id, loot_map_id, quantity) VALUES (?, ?, 1)")
    .bind(userId, lootMapId)
    .run();
}

export async function setLootWishlistQuantity(db: D1Database, userId: string, lootMapId: number, quantity: number): Promise<void> {
  await db
    .prepare("INSERT INTO user_loot_wishlist (user_id, loot_map_id, quantity) VALUES (?, ?, ?) ON CONFLICT (user_id, loot_map_id) DO UPDATE SET quantity = excluded.quantity")
    .bind(userId, lootMapId, quantity)
    .run();
}

export async function removeFromLootWishlist(db: D1Database, userId: string, lootMapId: number): Promise<void> {
  await db
    .prepare("DELETE FROM user_loot_wishlist WHERE user_id = ? AND loot_map_id = ?")
    .bind(userId, lootMapId)
    .run();
}

// ============================================================
// App Settings Operations
// ============================================================

export async function getAppSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setAppSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(key, value)
    .run();
}

// ============================================================
// Pre-load Functions (bulk-load lookup tables into Maps)
// ============================================================

export interface VehicleRow {
  id: number;
  slug: string;
  name: string;
}

export async function loadVehicleMaps(
  db: D1Database,
): Promise<{
  bySlug: Map<string, number>;
  byNameLower: Map<string, number>;
  allRows: VehicleRow[];
}> {
  const result = await db.prepare("SELECT id, slug, name FROM vehicles WHERE is_paint_variant = 0").all();
  const bySlug = new Map<string, number>();
  const byNameLower = new Map<string, number>();
  const allRows: VehicleRow[] = [];
  for (const row of result.results) {
    const r = row as unknown as VehicleRow;
    bySlug.set(r.slug, r.id);
    byNameLower.set(r.name.toLowerCase(), r.id);
    allRows.push(r);
  }
  return { bySlug, byNameLower, allRows };
}

// ============================================================
// Statement Builders (return D1PreparedStatement for batching)
// ============================================================

export function buildUpdateVehicleImagesStatement(
  db: D1Database,
  slug: string,
  imageURL: string,
  small: string,
  medium: string,
  large: string,
): D1PreparedStatement[] {
  // Only update vehicles.image_url* if this vehicle has no CF Images ID yet.
  // CF delivery URLs are authoritative — RSI sync must not overwrite them.
  return [
    db
      .prepare(
        `UPDATE vehicles SET
          image_url = ?, image_url_small = ?, image_url_medium = ?, image_url_large = ?,
          updated_at = datetime('now')
        WHERE slug = ?
          AND NOT EXISTS (
            SELECT 1 FROM vehicle_images
            WHERE vehicle_id = vehicles.id AND cf_images_id IS NOT NULL
          )`,
      )
      .bind(imageURL, small, medium, large, slug),
  ];
}

export function buildUpdatePaintImagesStatement(
  db: D1Database,
  className: string,
  imageURL: string,
  small: string,
  medium: string,
  large: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE paints SET
        image_url = ?, image_url_small = ?, image_url_medium = ?, image_url_large = ?,
        updated_at = datetime('now')
      WHERE class_name = ?`,
    )
    .bind(imageURL, small, medium, large, className);
}

// ============================================================
// Batched Write Functions
// ============================================================

export async function setPaintVehiclesBatch(
  db: D1Database,
  paintID: number,
  vehicleIDs: number[],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM paint_vehicles WHERE paint_id = ?").bind(paintID),
  ];
  for (const vid of vehicleIDs) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO paint_vehicles (paint_id, vehicle_id) VALUES (?, ?)")
        .bind(paintID, vid),
    );
  }
  await db.batch(stmts);
}

export async function syncVehicleLoanersBatch(
  db: D1Database,
  vehicleID: number,
  loanerSlugs: string[],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM vehicle_loaners WHERE vehicle_id = ?").bind(vehicleID),
  ];
  for (const slug of loanerSlugs) {
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO vehicle_loaners (vehicle_id, loaner_id) SELECT ?, id FROM vehicles WHERE slug = ?",
        )
        .bind(vehicleID, slug),
    );
  }
  await db.batch(stmts);
}

// ============================================================
// Cloudflare Images
// ============================================================

export interface VehicleForCFUpload {
  vehicle_id: number;
  slug: string;
  best_image_url: string;
}

export async function getVehiclesNeedingCFUpload(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<VehicleForCFUpload[]> {
  const result = await db
    .prepare(
      `SELECT v.id as vehicle_id, v.slug, v.image_url as best_image_url
      FROM vehicles v
      JOIN vehicle_images vi ON vi.vehicle_id = v.id
      WHERE vi.cf_images_id IS NULL
        AND v.image_url IS NOT NULL
        AND v.image_url LIKE 'http%'
      ORDER BY v.slug
      LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<VehicleForCFUpload>();
  return result.results;
}

// --- Loot by-location aggregation (POI feature) ---

interface LootSummaryRow {
  uuid: string;
  rarity: string | null;
  containers_json: string | null;
  shops_json: string | null;
  npcs_json: string | null;
}

interface LocationSummary {
  key: string;
  itemCount: number;
  rarities: Record<string, number>;
}

interface LootLocationSummaryResult {
  containers: LocationSummary[];
  shops: LocationSummary[];
  npcs: LocationSummary[];
}

const LOOT_BASE_WHERE = `
  lm.game_version_id = (SELECT id FROM game_versions WHERE is_default = 1)
  AND lm.name NOT IN ('<= PLACEHOLDER =>')
  AND lm.name NOT LIKE 'EntityClassDefinition.%'
  AND lm.type IS NOT NULL AND lm.type != ''
  AND lm.type NOT IN (
    'NOITEM_Vehicle','UNDEFINED',
    'Char_Skin_Color','Char_Head_Hair','Char_Hair_Color',
    'Char_Head_Eyes','Char_Body','Char_Head_Eyelash',
    'Currency','MobiGlas'
  )`;

const LOOT_CATEGORY_CASE = `CASE
  WHEN lm.fps_weapon_id IS NOT NULL THEN 'weapon'
  WHEN lm.fps_armour_id IS NOT NULL THEN 'armour'
  WHEN lm.fps_attachment_id IS NOT NULL THEN 'attachment'
  WHEN lm.fps_utility_id IS NOT NULL THEN 'utility'
  WHEN lm.fps_helmet_id IS NOT NULL THEN 'helmet'
  WHEN lm.fps_clothing_id IS NOT NULL THEN 'clothing'
  WHEN lm.consumable_id IS NOT NULL THEN 'consumable'
  WHEN lm.harvestable_id IS NOT NULL THEN 'harvestable'
  WHEN lm.props_id IS NOT NULL THEN 'prop'
  WHEN lm.vehicle_component_id IS NOT NULL THEN 'ship_component'
  WHEN lm.ship_missile_id IS NOT NULL THEN 'missile'
  ELSE 'unknown'
END`;

function parseJsonArray(val: string | null): unknown[] {
  if (!val || val === "null" || val === "[]" || val === "") return [];
  try { return JSON.parse(val) as unknown[]; } catch { return []; }
}

/**
 * Lightweight summary for the POI directory page.
 * Returns location keys + item counts + rarity distributions — no item arrays.
 * Paginated D1 reads but tiny response (~20KB).
 */
export async function getLootLocationSummary(db: D1Database): Promise<LootLocationSummaryResult> {
  const PAGE_SIZE = 500;
  const sql = `SELECT lm.uuid, lm.rarity, lm.containers_json, lm.shops_json, lm.npcs_json
    FROM loot_map lm
    WHERE ${LOOT_BASE_WHERE}
      AND (
        (lm.containers_json IS NOT NULL AND lm.containers_json NOT IN ('null','[]',''))
        OR (lm.shops_json IS NOT NULL AND lm.shops_json NOT IN ('null','[]',''))
        OR (lm.npcs_json IS NOT NULL AND lm.npcs_json NOT IN ('null','[]',''))
      )
    ORDER BY lm.id
    LIMIT ? OFFSET ?`;

  // key → { uuids: Set, rarities: Record<string, number> }
  const containerAcc: Record<string, { uuids: Set<string>; rarities: Record<string, number> }> = {};
  const shopAcc: Record<string, { uuids: Set<string>; rarities: Record<string, number> }> = {};
  const npcAcc: Record<string, { uuids: Set<string>; rarities: Record<string, number> }> = {};

  function addToAcc(
    acc: Record<string, { uuids: Set<string>; rarities: Record<string, number> }>,
    key: string,
    uuid: string,
    rarity: string | null,
  ) {
    if (!acc[key]) acc[key] = { uuids: new Set(), rarities: {} };
    const bucket = acc[key];
    if (bucket.uuids.has(uuid)) return;
    bucket.uuids.add(uuid);
    const r = rarity || "Common";
    bucket.rarities[r] = (bucket.rarities[r] || 0) + 1;
  }

  let offset = 0;
  while (true) {
    const result = await db.prepare(sql).bind(PAGE_SIZE, offset).all<LootSummaryRow>();
    const rows = result.results;
    if (rows.length === 0) break;

    for (const row of rows) {
      for (const e of parseJsonArray(row.containers_json) as Array<Record<string, unknown>>) {
        const k = (e.location || e.locationTag || "") as string;
        if (k) addToAcc(containerAcc, k, row.uuid, row.rarity);
      }
      for (const e of parseJsonArray(row.shops_json) as Array<Record<string, unknown>>) {
        const k = (e.shop || e.name || "") as string;
        if (k) addToAcc(shopAcc, k, row.uuid, row.rarity);
      }
      for (const e of parseJsonArray(row.npcs_json) as Array<Record<string, unknown>>) {
        const k = (e.faction || e.actor || e.name || "") as string;
        if (k) addToAcc(npcAcc, k, row.uuid, row.rarity);
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  function toSummaries(acc: Record<string, { uuids: Set<string>; rarities: Record<string, number> }>): LocationSummary[] {
    return Object.entries(acc).map(([key, { uuids, rarities }]) => ({
      key,
      itemCount: uuids.size,
      rarities,
    }));
  }

  return {
    containers: toSummaries(containerAcc),
    shops: toSummaries(shopAcc),
    npcs: toSummaries(npcAcc),
  };
}

/**
 * Full item list for a single location (POI detail page).
 * Uses LIKE pre-filter on the JSON column so D1 returns ~50-200 rows instead of 5000+.
 */
interface LocationItem {
  uuid: string;
  name: string;
  type: string | null;
  sub_type: string | null;
  rarity: string | null;
  category: string;
  perContainer?: number;
  containerType?: string;
  buyPrice?: number;
  probability?: number;
  slot?: string;
}

interface LocationDetailResult {
  items: LocationItem[];
}

export async function getLootLocationDetail(
  db: D1Database,
  locType: "container" | "shop" | "npc",
  slug: string,
): Promise<LocationDetailResult> {
  const jsonCol =
    locType === "container" ? "containers_json"
    : locType === "shop" ? "shops_json"
    : "npcs_json";

  // LIKE pre-filter: dramatically reduces rows. False positives are filtered in JS.
  const likePattern = `%${slug.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

  const sql = `SELECT
      lm.uuid, lm.name, lm.type, lm.sub_type, lm.rarity,
      lm.${jsonCol} as target_json,
      ${LOOT_CATEGORY_CASE} as category
    FROM loot_map lm
    WHERE ${LOOT_BASE_WHERE}
      AND lm.${jsonCol} IS NOT NULL
      AND lm.${jsonCol} NOT IN ('null','[]','')
      AND lm.${jsonCol} LIKE ? ESCAPE '\\'
    ORDER BY lm.name`;

  const result = await db.prepare(sql).bind(likePattern).all<{
    uuid: string;
    name: string;
    type: string | null;
    sub_type: string | null;
    rarity: string | null;
    category: string;
    target_json: string | null;
  }>();

  const items: LocationItem[] = [];
  const seen = new Set<string>();

  for (const row of result.results) {
    if (seen.has(row.uuid)) continue;
    const entries = parseJsonArray(row.target_json) as Array<Record<string, unknown>>;

    // Find the entry that exactly matches the slug
    let matched: Record<string, unknown> | undefined;
    for (const e of entries) {
      const key =
        locType === "container" ? ((e.location || e.locationTag || "") as string)
        : locType === "shop" ? ((e.shop || e.name || "") as string)
        : ((e.faction || e.actor || e.name || "") as string);
      if (key === slug) { matched = e; break; }
    }
    if (!matched) continue;

    seen.add(row.uuid);
    const item: LocationItem = {
      uuid: row.uuid,
      name: row.name,
      type: row.type,
      sub_type: row.sub_type,
      rarity: row.rarity,
      category: row.category,
    };
    if (locType === "container") {
      if (matched.perContainer != null) item.perContainer = matched.perContainer as number;
      if (matched.containerType != null) item.containerType = matched.containerType as string;
    } else if (locType === "shop") {
      if (matched.buyPrice != null) item.buyPrice = matched.buyPrice as number;
    } else {
      if (matched.probability != null) item.probability = matched.probability as number;
      if (matched.slot != null) item.slot = matched.slot as string;
    }
    items.push(item);
  }

  return { items };
}

export async function setVehicleCFImagesID(
  db: D1Database,
  vehicleId: number,
  cfImagesId: string,
  accountHash: string,
): Promise<void> {
  const base = `https://imagedelivery.net/${accountHash}/${cfImagesId}`;
  await db.batch([
    db
      .prepare(
        `UPDATE vehicle_images SET cf_images_id = ?, updated_at = datetime('now')
        WHERE vehicle_id = ?`,
      )
      .bind(cfImagesId, vehicleId),
    db
      .prepare(
        `UPDATE vehicles SET
          image_url        = ?,
          image_url_small  = ?,
          image_url_medium = ?,
          image_url_large  = ?,
          updated_at       = datetime('now')
        WHERE id = ?`,
      )
      .bind(
        `${base}/medium`,
        `${base}/thumb`,
        `${base}/medium`,
        `${base}/large`,
        vehicleId,
      ),
  ]);
}
