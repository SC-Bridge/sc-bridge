/**
 * D1 database query functions — ported from internal/database/database.go
 *
 * All queries use D1's prepared statement API: db.prepare(sql).bind(...params)
 * D1 is SQLite-compatible, so we use SQLite syntax throughout.
 */

import type {
  Vehicle,
  Manufacturer,
  Paint,
  GameVersion,
  Component,
  Port,
  FPSWeapon,
  FPSArmour,
  FPSAttachment,
  FPSAmmo,
  FPSUtility,
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

// ============================================================
// Manufacturer Operations
// ============================================================

export async function upsertManufacturer(
  db: D1Database,
  m: Partial<Manufacturer> & { uuid: string; name: string; slug: string },
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO manufacturers (uuid, name, slug, code, known_for, description, logo_url, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET
        name=excluded.name, slug=excluded.slug, code=excluded.code,
        known_for=excluded.known_for, description=excluded.description,
        logo_url=excluded.logo_url, raw_data=excluded.raw_data,
        updated_at=excluded.updated_at`,
    )
    .bind(m.uuid, m.name, m.slug, n(m.code), n(m.known_for), n(m.description), n(m.logo_url), null)
    .run();

  // Always SELECT — D1's last_row_id is unreliable on upsert UPDATE path
  const row = await db
    .prepare("SELECT id FROM manufacturers WHERE uuid = ?")
    .bind(m.uuid)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export async function getManufacturerIDByUUID(db: D1Database, uuid: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM manufacturers WHERE uuid = ?")
    .bind(uuid)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function getManufacturerIDByName(db: D1Database, name: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM manufacturers WHERE name = ?")
    .bind(name)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function getManufacturerIDByCode(db: D1Database, code: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM manufacturers WHERE code = ?")
    .bind(code)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function resolveManufacturerID(
  db: D1Database,
  name: string,
  code: string,
): Promise<number | null> {
  // Try exact name
  if (name) {
    const id = await getManufacturerIDByName(db, name);
    if (id !== null) return id;
  }
  // Try exact code
  if (code) {
    const id = await getManufacturerIDByCode(db, code);
    if (id !== null) return id;
  }
  // Try name as prefix
  if (name) {
    const row = await db
      .prepare("SELECT id FROM manufacturers WHERE name LIKE ? ORDER BY name LIMIT 1")
      .bind(name + "%")
      .first<{ id: number }>();
    if (row) return row.id;
  }
  // Bidirectional code prefix match
  if (code && code.length >= 3) {
    const rows = await db
      .prepare(
        `SELECT id FROM manufacturers
        WHERE code IS NOT NULL AND code <> '' AND (code LIKE ? OR ? LIKE code || '%')
        LIMIT 2`,
      )
      .bind(code + "%", code)
      .all();
    if (rows.results.length === 1) {
      return (rows.results[0] as { id: number }).id;
    }
  }
  // Well-known abbreviations
  if (name) {
    const knownAbbrevs: Record<string, string> = {
      MISC: "Musashi Industrial & Starflight Concern",
    };
    const fullName = knownAbbrevs[name];
    if (fullName) {
      const id = await getManufacturerIDByName(db, fullName);
      if (id !== null) return id;
    }
  }
  return null;
}

export async function updateManufacturerCode(db: D1Database, id: number, code: string): Promise<void> {
  await db
    .prepare("UPDATE manufacturers SET code = ? WHERE id = ? AND (code IS NULL OR code = '')")
    .bind(code, id)
    .run();
}

export async function getManufacturerCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) as count FROM manufacturers").first<{ count: number }>();
  return row?.count ?? 0;
}

// ============================================================
// Production Status Operations
// ============================================================

export async function getProductionStatusIDByKey(db: D1Database, key: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM production_statuses WHERE key = ?")
    .bind(key)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// ============================================================
// Game Version Operations
// ============================================================

export async function upsertGameVersion(
  db: D1Database,
  gv: Partial<GameVersion> & { uuid: string; code: string },
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO game_versions (uuid, code, channel, is_default, released_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET
        code=excluded.code, channel=excluded.channel,
        is_default=excluded.is_default, released_at=excluded.released_at,
        updated_at=excluded.updated_at`,
    )
    .bind(gv.uuid, gv.code, n(gv.channel), gv.is_default ? 1 : 0, n(gv.released_at))
    .run();

  // Always SELECT — D1's last_row_id is unreliable on upsert UPDATE path
  const row = await db
    .prepare("SELECT id FROM game_versions WHERE uuid = ?")
    .bind(gv.uuid)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export async function getGameVersionIDByUUID(db: D1Database, uuid: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM game_versions WHERE uuid = ?")
    .bind(uuid)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// ============================================================
// Vehicle Operations
// ============================================================

export async function upsertVehicle(
  db: D1Database,
  v: Partial<Vehicle> & { slug: string; name: string },
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id, vehicle_type_id,
        production_status_id, size, size_label, focus, classification, description,
        length, beam, height, mass, cargo, vehicle_inventory, crew_min, crew_max,
        speed_scm, speed_max, health, pledge_price, price_auec, on_sale,
        image_url, image_url_small, image_url_medium, image_url_large,
        pledge_url, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(slug) DO UPDATE SET
        uuid=COALESCE(excluded.uuid, vehicles.uuid),
        name=excluded.name, class_name=COALESCE(excluded.class_name, vehicles.class_name),
        manufacturer_id=COALESCE(excluded.manufacturer_id, vehicles.manufacturer_id),
        vehicle_type_id=COALESCE(excluded.vehicle_type_id, vehicles.vehicle_type_id),
        production_status_id=COALESCE(excluded.production_status_id, vehicles.production_status_id),
        size=COALESCE(excluded.size, vehicles.size),
        size_label=COALESCE(excluded.size_label, vehicles.size_label),
        focus=COALESCE(excluded.focus, vehicles.focus),
        classification=COALESCE(excluded.classification, vehicles.classification),
        description=COALESCE(excluded.description, vehicles.description),
        length=COALESCE(excluded.length, vehicles.length),
        beam=COALESCE(excluded.beam, vehicles.beam),
        height=COALESCE(excluded.height, vehicles.height),
        mass=COALESCE(excluded.mass, vehicles.mass),
        cargo=COALESCE(excluded.cargo, vehicles.cargo),
        vehicle_inventory=COALESCE(excluded.vehicle_inventory, vehicles.vehicle_inventory),
        crew_min=COALESCE(excluded.crew_min, vehicles.crew_min),
        crew_max=COALESCE(excluded.crew_max, vehicles.crew_max),
        speed_scm=COALESCE(excluded.speed_scm, vehicles.speed_scm),
        speed_max=COALESCE(excluded.speed_max, vehicles.speed_max),
        health=COALESCE(excluded.health, vehicles.health),
        pledge_price=COALESCE(excluded.pledge_price, vehicles.pledge_price),
        price_auec=COALESCE(excluded.price_auec, vehicles.price_auec),
        on_sale=excluded.on_sale,
        image_url=COALESCE(excluded.image_url, vehicles.image_url),
        image_url_small=COALESCE(excluded.image_url_small, vehicles.image_url_small),
        image_url_medium=COALESCE(excluded.image_url_medium, vehicles.image_url_medium),
        image_url_large=COALESCE(excluded.image_url_large, vehicles.image_url_large),
        pledge_url=COALESCE(excluded.pledge_url, vehicles.pledge_url),
        game_version_id=COALESCE(excluded.game_version_id, vehicles.game_version_id),
        raw_data=COALESCE(excluded.raw_data, vehicles.raw_data),
        updated_at=excluded.updated_at`,
    )
    .bind(
      n(v.uuid),                                 //  1: uuid
      v.slug,                                    //  2: slug
      v.name,                                    //  3: name
      n(v.class_name),                           //  4: class_name
      nNum(v.manufacturer_id),                   //  5: manufacturer_id
      nNum(v.vehicle_type_id),                   //  6: vehicle_type_id
      nNum(v.production_status_id),              //  7: production_status_id
      nNum(v.size),                              //  8: size
      n(v.size_label),                           //  9: size_label
      n(v.focus),                                // 10: focus
      n(v.classification),                       // 11: classification
      n(v.description),                          // 12: description
      nNum(v.length),                            // 13: length
      nNum(v.beam),                              // 14: beam
      nNum(v.height),                            // 15: height
      nNum(v.mass),                              // 16: mass
      nNum(v.cargo),                             // 17: cargo
      nNum(v.vehicle_inventory),                 // 18: vehicle_inventory
      nNum(v.crew_min),                          // 19: crew_min
      nNum(v.crew_max),                          // 20: crew_max
      nNum(v.speed_scm),                         // 21: speed_scm
      nNum(v.speed_max),                         // 22: speed_max
      nNum(v.health),                            // 23: health
      nNum(v.pledge_price),                      // 24: pledge_price
      nNum(v.price_auec),                        // 25: price_auec
      v.on_sale ? 1 : 0,                         // 26: on_sale
      n(v.image_url),                            // 27: image_url
      n(v.image_url_small),                      // 28: image_url_small
      n(v.image_url_medium),                     // 29: image_url_medium
      n(v.image_url_large),                      // 30: image_url_large
      n(v.pledge_url),                           // 31: pledge_url
      nNum(v.game_version_id),                   // 32: game_version_id
      null,                                      // 33: raw_data
    )
    .run();

  // Always SELECT — D1's last_row_id is unreliable on upsert UPDATE path
  const row = await db
    .prepare("SELECT id FROM vehicles WHERE slug = ?")
    .bind(v.slug)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

/** Returns a prepared statement for vehicle upsert — caller batches via db.batch(). */
export function buildUpsertVehicleStatement(
  db: D1Database,
  v: Partial<Vehicle> & { slug: string; name: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO vehicles (uuid, slug, name, class_name, manufacturer_id, vehicle_type_id,
        production_status_id, size, size_label, focus, classification, description,
        length, beam, height, mass, cargo, vehicle_inventory, crew_min, crew_max,
        speed_scm, speed_max, health, pledge_price, price_auec, on_sale,
        image_url, image_url_small, image_url_medium, image_url_large,
        pledge_url, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(slug) DO UPDATE SET
        uuid=COALESCE(excluded.uuid, vehicles.uuid),
        name=excluded.name, class_name=COALESCE(excluded.class_name, vehicles.class_name),
        manufacturer_id=COALESCE(excluded.manufacturer_id, vehicles.manufacturer_id),
        vehicle_type_id=COALESCE(excluded.vehicle_type_id, vehicles.vehicle_type_id),
        production_status_id=COALESCE(excluded.production_status_id, vehicles.production_status_id),
        size=COALESCE(excluded.size, vehicles.size),
        size_label=COALESCE(excluded.size_label, vehicles.size_label),
        focus=COALESCE(excluded.focus, vehicles.focus),
        classification=COALESCE(excluded.classification, vehicles.classification),
        description=COALESCE(excluded.description, vehicles.description),
        length=COALESCE(excluded.length, vehicles.length),
        beam=COALESCE(excluded.beam, vehicles.beam),
        height=COALESCE(excluded.height, vehicles.height),
        mass=COALESCE(excluded.mass, vehicles.mass),
        cargo=COALESCE(excluded.cargo, vehicles.cargo),
        vehicle_inventory=COALESCE(excluded.vehicle_inventory, vehicles.vehicle_inventory),
        crew_min=COALESCE(excluded.crew_min, vehicles.crew_min),
        crew_max=COALESCE(excluded.crew_max, vehicles.crew_max),
        speed_scm=COALESCE(excluded.speed_scm, vehicles.speed_scm),
        speed_max=COALESCE(excluded.speed_max, vehicles.speed_max),
        health=COALESCE(excluded.health, vehicles.health),
        pledge_price=COALESCE(excluded.pledge_price, vehicles.pledge_price),
        price_auec=COALESCE(excluded.price_auec, vehicles.price_auec),
        on_sale=excluded.on_sale,
        image_url=COALESCE(excluded.image_url, vehicles.image_url),
        image_url_small=COALESCE(excluded.image_url_small, vehicles.image_url_small),
        image_url_medium=COALESCE(excluded.image_url_medium, vehicles.image_url_medium),
        image_url_large=COALESCE(excluded.image_url_large, vehicles.image_url_large),
        pledge_url=COALESCE(excluded.pledge_url, vehicles.pledge_url),
        game_version_id=COALESCE(excluded.game_version_id, vehicles.game_version_id),
        raw_data=COALESCE(excluded.raw_data, vehicles.raw_data),
        updated_at=excluded.updated_at`,
    )
    .bind(
      n(v.uuid),                                 //  1: uuid
      v.slug,                                    //  2: slug
      v.name,                                    //  3: name
      n(v.class_name),                           //  4: class_name
      nNum(v.manufacturer_id),                   //  5: manufacturer_id
      nNum(v.vehicle_type_id),                   //  6: vehicle_type_id
      nNum(v.production_status_id),              //  7: production_status_id
      nNum(v.size),                              //  8: size
      n(v.size_label),                           //  9: size_label
      n(v.focus),                                // 10: focus
      n(v.classification),                       // 11: classification
      n(v.description),                          // 12: description
      nNum(v.length),                            // 13: length
      nNum(v.beam),                              // 14: beam
      nNum(v.height),                            // 15: height
      nNum(v.mass),                              // 16: mass
      nNum(v.cargo),                             // 17: cargo
      nNum(v.vehicle_inventory),                 // 18: vehicle_inventory
      nNum(v.crew_min),                          // 19: crew_min
      nNum(v.crew_max),                          // 20: crew_max
      nNum(v.speed_scm),                         // 21: speed_scm
      nNum(v.speed_max),                         // 22: speed_max
      nNum(v.health),                            // 23: health
      nNum(v.pledge_price),                      // 24: pledge_price
      nNum(v.price_auec),                        // 25: price_auec
      v.on_sale ? 1 : 0,                         // 26: on_sale
      n(v.image_url),                            // 27: image_url
      n(v.image_url_small),                      // 28: image_url_small
      n(v.image_url_medium),                     // 29: image_url_medium
      n(v.image_url_large),                      // 30: image_url_large
      n(v.pledge_url),                           // 31: pledge_url
      nNum(v.game_version_id),                   // 32: game_version_id
      null,                                      // 33: raw_data
    );
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

export async function findVehicleSlug(
  db: D1Database,
  candidateSlugs: string[],
  displayName: string,
): Promise<string | null> {
  for (const slug of candidateSlugs) {
    if (!slug) continue;
    const row = await db
      .prepare("SELECT slug FROM vehicles WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first<{ slug: string }>();
    if (row) return row.slug;
  }

  if (displayName) {
    const row = await db
      .prepare("SELECT slug FROM vehicles WHERE LOWER(name) = LOWER(?) LIMIT 1")
      .bind(displayName)
      .first<{ slug: string }>();
    if (row) return row.slug;
  }

  for (const slug of candidateSlugs) {
    if (!slug || slug.length < 3) continue;
    const row = await db
      .prepare("SELECT slug FROM vehicles WHERE slug LIKE ? LIMIT 1")
      .bind(slug + "%")
      .first<{ slug: string }>();
    if (row) return row.slug;
  }

  return null;
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
// Component Operations
// ============================================================

export async function upsertComponent(db: D1Database, c: Partial<Component> & { uuid: string; name: string; type: string }): Promise<void> {
  await buildUpsertComponentStatement(db, c).run();
}

export function buildUpsertComponentStatement(db: D1Database, c: Partial<Component> & { uuid: string; name: string; type: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO components (uuid, name, slug, class_name, manufacturer_id, type, sub_type,
        size, grade, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET
        name=excluded.name, slug=excluded.slug, class_name=excluded.class_name,
        manufacturer_id=excluded.manufacturer_id, type=excluded.type, sub_type=excluded.sub_type,
        size=excluded.size, grade=excluded.grade, description=excluded.description,
        game_version_id=excluded.game_version_id, raw_data=excluded.raw_data,
        updated_at=excluded.updated_at`,
    )
    .bind(
      c.uuid, c.name, n(c.slug), n(c.class_name), nNum(c.manufacturer_id),
      c.type, n(c.sub_type), nNum(c.size), n(c.grade), n(c.description),
      nNum(c.game_version_id), null,
    );
}

// ============================================================
// Port Operations
// ============================================================

export async function upsertPort(db: D1Database, p: Partial<Port> & { uuid: string; vehicle_id: number; name: string }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ports (uuid, vehicle_id, parent_port_id, name, position, category_label,
        size_min, size_max, port_type, port_subtype, equipped_item_uuid, editable, health)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        vehicle_id=excluded.vehicle_id, name=excluded.name, category_label=excluded.category_label,
        size_min=excluded.size_min, size_max=excluded.size_max, port_type=excluded.port_type,
        equipped_item_uuid=excluded.equipped_item_uuid`,
    )
    .bind(
      p.uuid, p.vehicle_id, nNum(p.parent_port_id), p.name, n(p.position), n(p.category_label),
      nNum(p.size_min), nNum(p.size_max), n(p.port_type), n(p.port_subtype),
      n(p.equipped_item_uuid), p.editable ? 1 : 0, nNum(p.health),
    )
    .run();
}

// ============================================================
// FPS Item Operations
// ============================================================

export async function upsertFPSWeapon(db: D1Database, item: Partial<FPSWeapon> & { uuid: string; name: string }): Promise<void> {
  await buildUpsertFPSWeaponStatement(db, item).run();
}

export function buildUpsertFPSWeaponStatement(db: D1Database, item: Partial<FPSWeapon> & { uuid: string; name: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fps_weapons (uuid, name, slug, class_name, manufacturer_id, sub_type, size, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, manufacturer_id=excluded.manufacturer_id, sub_type=excluded.sub_type, size=excluded.size, description=excluded.description, game_version_id=excluded.game_version_id, raw_data=excluded.raw_data, updated_at=excluded.updated_at`,
    )
    .bind(item.uuid, item.name, n(item.slug), n(item.class_name), nNum(item.manufacturer_id), n(item.sub_type), nNum(item.size), n(item.description), nNum(item.game_version_id), null);
}

export async function upsertFPSArmour(db: D1Database, item: Partial<FPSArmour> & { uuid: string; name: string }): Promise<void> {
  await buildUpsertFPSArmourStatement(db, item).run();
}

export function buildUpsertFPSArmourStatement(db: D1Database, item: Partial<FPSArmour> & { uuid: string; name: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fps_armour (uuid, name, slug, class_name, manufacturer_id, sub_type, size, grade, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, manufacturer_id=excluded.manufacturer_id, sub_type=excluded.sub_type, size=excluded.size, grade=excluded.grade, description=excluded.description, game_version_id=excluded.game_version_id, raw_data=excluded.raw_data, updated_at=excluded.updated_at`,
    )
    .bind(item.uuid, item.name, n(item.slug), n(item.class_name), nNum(item.manufacturer_id), n(item.sub_type), nNum(item.size), n(item.grade), n(item.description), nNum(item.game_version_id), null);
}

export async function upsertFPSAttachment(db: D1Database, item: Partial<FPSAttachment> & { uuid: string; name: string }): Promise<void> {
  await buildUpsertFPSAttachmentStatement(db, item).run();
}

export function buildUpsertFPSAttachmentStatement(db: D1Database, item: Partial<FPSAttachment> & { uuid: string; name: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fps_attachments (uuid, name, slug, class_name, manufacturer_id, sub_type, size, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, manufacturer_id=excluded.manufacturer_id, sub_type=excluded.sub_type, size=excluded.size, description=excluded.description, game_version_id=excluded.game_version_id, raw_data=excluded.raw_data, updated_at=excluded.updated_at`,
    )
    .bind(item.uuid, item.name, n(item.slug), n(item.class_name), nNum(item.manufacturer_id), n(item.sub_type), nNum(item.size), n(item.description), nNum(item.game_version_id), null);
}

export async function upsertFPSAmmo(db: D1Database, item: Partial<FPSAmmo> & { uuid: string; name: string }): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fps_ammo (uuid, name, slug, class_name, manufacturer_id, sub_type, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, manufacturer_id=excluded.manufacturer_id, sub_type=excluded.sub_type, description=excluded.description, game_version_id=excluded.game_version_id, raw_data=excluded.raw_data, updated_at=excluded.updated_at`,
    )
    .bind(item.uuid, item.name, n(item.slug), n(item.class_name), nNum(item.manufacturer_id), n(item.sub_type), n(item.description), nNum(item.game_version_id), null)
    .run();
}

export async function upsertFPSUtility(db: D1Database, item: Partial<FPSUtility> & { uuid: string; name: string }): Promise<void> {
  await buildUpsertFPSUtilityStatement(db, item).run();
}

export function buildUpsertFPSUtilityStatement(db: D1Database, item: Partial<FPSUtility> & { uuid: string; name: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fps_utilities (uuid, name, slug, class_name, manufacturer_id, sub_type, description, game_version_id, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, manufacturer_id=excluded.manufacturer_id, sub_type=excluded.sub_type, description=excluded.description, game_version_id=excluded.game_version_id, raw_data=excluded.raw_data, updated_at=excluded.updated_at`,
    )
    .bind(item.uuid, item.name, n(item.slug), n(item.class_name), nNum(item.manufacturer_id), n(item.sub_type), n(item.description), nNum(item.game_version_id), null);
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

export async function setPaintVehicles(db: D1Database, paintID: number, vehicleIDs: number[]): Promise<void> {
  await db.prepare("DELETE FROM paint_vehicles WHERE paint_id = ?").bind(paintID).run();

  for (const vid of vehicleIDs) {
    await db
      .prepare("INSERT OR IGNORE INTO paint_vehicles (paint_id, vehicle_id) VALUES (?, ?)")
      .bind(paintID, vid)
      .run();
  }
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
      `INSERT INTO sync_history (source_id, endpoint, status, started_at) VALUES (?, ?, ?, datetime('now'))`,
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
      "UPDATE sync_history SET status = ?, record_count = ?, error_message = ?, completed_at = datetime('now') WHERE id = ?",
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

export async function loadManufacturerMaps(
  db: D1Database,
): Promise<{ byUUID: Map<string, number>; byName: Map<string, number> }> {
  const result = await db.prepare("SELECT id, uuid, name FROM manufacturers").all();
  const byUUID = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const row of result.results) {
    const r = row as { id: number; uuid: string; name: string };
    byUUID.set(r.uuid, r.id);
    byName.set(r.name, r.id);
  }
  return { byUUID, byName };
}

export async function loadGameVersionMap(db: D1Database): Promise<Map<string, number>> {
  const result = await db.prepare("SELECT id, uuid FROM game_versions").all();
  const map = new Map<string, number>();
  for (const row of result.results) {
    const r = row as { id: number; uuid: string };
    map.set(r.uuid, r.id);
  }
  return map;
}

export async function loadProductionStatusMap(db: D1Database): Promise<Map<string, number>> {
  const result = await db.prepare("SELECT id, key FROM production_statuses").all();
  const map = new Map<string, number>();
  for (const row of result.results) {
    const r = row as { id: number; key: string };
    map.set(r.key, r.id);
  }
  return map;
}

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
  const result = await db.prepare("SELECT id, slug, name FROM vehicles").all();
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

export function buildUpsertPortStatement(
  db: D1Database,
  p: Partial<Port> & { uuid: string; vehicle_id: number; name: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ports (uuid, vehicle_id, parent_port_id, name, position, category_label,
        size_min, size_max, port_type, port_subtype, equipped_item_uuid, editable, health)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        vehicle_id=excluded.vehicle_id, name=excluded.name, category_label=excluded.category_label,
        size_min=excluded.size_min, size_max=excluded.size_max, port_type=excluded.port_type,
        equipped_item_uuid=excluded.equipped_item_uuid`,
    )
    .bind(
      p.uuid, p.vehicle_id, nNum(p.parent_port_id), p.name, n(p.position), n(p.category_label),
      nNum(p.size_min), nNum(p.size_max), n(p.port_type), n(p.port_subtype),
      n(p.equipped_item_uuid), p.editable ? 1 : 0, nNum(p.health),
    );
}

export function buildUpdateVehicleImagesStatement(
  db: D1Database,
  slug: string,
  imageURL: string,
  small: string,
  medium: string,
  large: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE vehicles SET
        image_url = ?, image_url_small = ?, image_url_medium = ?, image_url_large = ?,
        updated_at = datetime('now')
      WHERE slug = ?`,
    )
    .bind(imageURL, small, medium, large, slug);
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
