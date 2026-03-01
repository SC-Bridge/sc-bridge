-- 0037_patch_versioning.sql
--
-- Activate the game_versions infrastructure that has been in the schema since 0001
-- but was never populated.
--
-- Changes:
--   1. Seed 4.6.0-live.11319298 as the first (and default) game version.
--   2. Rebuild all 15 game-data tables so each row is keyed by (uuid/slug, game_version_id)
--      instead of uuid alone. The UPSERT ON CONFLICT target changes from (uuid) to
--      (uuid, game_version_id), enabling per-patch history without data loss.
--
-- All existing rows are backfilled to game_version_id = 4.6.0-live.11319298.
-- No user-owned rows (user_fleet, user_loot_collection, etc.) are touched.

-- Disable FK enforcement for the duration of this migration.
-- SQLite 3.26.0+ auto-updates FK references in dependent tables when a table
-- is renamed via ALTER TABLE RENAME TO. This means DROP TABLE _old fails
-- because the still-unbuilt tables have had their FK references auto-redirected
-- to the _old name. Disabling FK checks allows the rename-create-drop pattern
-- to complete. New connections get D1's default (FKs ON) automatically.
PRAGMA foreign_keys = OFF;

-- ============================================================
-- Step 1 — Seed the current patch
-- ============================================================

INSERT OR IGNORE INTO game_versions (uuid, code, channel, is_default, released_at)
VALUES ('11319298-4600-0000-0000-000000000001', '4.6.0-live.11319298', 'LIVE', 1, '2026-02-25');

-- ============================================================
-- Step 2 — Rebuild game-data tables
--
-- Pattern for each table:
--   a) Rename old → _old
--   b) CREATE new with NOT NULL game_version_id + UNIQUE(uuid, game_version_id)
--   c) INSERT … SELECT backfilling game_version_id = 4.6.0 for pre-existing rows
--   d) DROP _old
--   e) Recreate any dropped indexes
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 2.1  manufacturers
--      Was: uuid TEXT UNIQUE NOT NULL
--      Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE manufacturers RENAME TO manufacturers_old;

CREATE TABLE manufacturers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL,
  code            TEXT,
  known_for       TEXT,
  description     TEXT,
  logo_url        TEXT,
  raw_data        TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO manufacturers
  (id, uuid, name, slug, code, known_for, description, logo_url, raw_data,
   game_version_id, created_at, updated_at)
SELECT id, uuid, name, slug, code, known_for, description, logo_url, raw_data,
  (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
  created_at, updated_at
FROM manufacturers_old;

DROP TABLE manufacturers_old;

-- ──────────────────────────────────────────────────────────────
-- 2.2  vehicles
--      Was: uuid TEXT UNIQUE, slug TEXT UNIQUE NOT NULL
--      Now: UNIQUE(slug, game_version_id)  (slug is the reliable non-null key)
--      uuid stays as a plain nullable column (no unique constraint needed for this table)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicles RENAME TO vehicles_old;

CREATE TABLE vehicles (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                      TEXT,
  slug                      TEXT    NOT NULL,
  name                      TEXT    NOT NULL,
  class_name                TEXT,
  manufacturer_id           INTEGER REFERENCES manufacturers(id),
  vehicle_type_id           INTEGER REFERENCES vehicle_types(id),
  production_status_id      INTEGER REFERENCES production_statuses(id),
  size                      INTEGER,
  size_label                TEXT,
  focus                     TEXT,
  classification            TEXT,
  description               TEXT,
  length                    REAL,
  beam                      REAL,
  height                    REAL,
  mass                      REAL,
  cargo                     REAL,
  vehicle_inventory         REAL,
  crew_min                  INTEGER,
  crew_max                  INTEGER,
  speed_scm                 REAL,
  speed_max                 REAL,
  health                    REAL,
  pledge_price              REAL,
  price_auec                REAL,
  on_sale                   BOOLEAN DEFAULT FALSE,
  image_url                 TEXT,
  image_url_small           TEXT,
  image_url_medium          TEXT,
  image_url_large           TEXT,
  pledge_url                TEXT,
  game_version_id           INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data                  TEXT,
  created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
  parent_vehicle_id         INTEGER REFERENCES vehicles(id),
  is_paint_variant          INTEGER NOT NULL DEFAULT 0,
  boost_speed_back          INTEGER,
  angular_velocity_pitch    REAL,
  angular_velocity_yaw      REAL,
  angular_velocity_roll     REAL,
  fuel_capacity_hydrogen    REAL,
  fuel_capacity_quantum     REAL,
  thruster_count_main       INTEGER,
  thruster_count_maneuvering INTEGER,
  acquisition_type          TEXT,
  UNIQUE(slug, game_version_id)
);

INSERT INTO vehicles
  (id, uuid, slug, name, class_name, manufacturer_id, vehicle_type_id,
   production_status_id, size, size_label, focus, classification, description,
   length, beam, height, mass, cargo, vehicle_inventory, crew_min, crew_max,
   speed_scm, speed_max, health, pledge_price, price_auec, on_sale,
   image_url, image_url_small, image_url_medium, image_url_large, pledge_url,
   game_version_id, raw_data, created_at, updated_at,
   parent_vehicle_id, is_paint_variant,
   boost_speed_back, angular_velocity_pitch, angular_velocity_yaw,
   angular_velocity_roll, fuel_capacity_hydrogen, fuel_capacity_quantum,
   thruster_count_main, thruster_count_maneuvering, acquisition_type)
SELECT id, uuid, slug, name, class_name, manufacturer_id, vehicle_type_id,
   production_status_id, size, size_label, focus, classification, description,
   length, beam, height, mass, cargo, vehicle_inventory, crew_min, crew_max,
   speed_scm, speed_max, health, pledge_price, price_auec, on_sale,
   image_url, image_url_small, image_url_medium, image_url_large, pledge_url,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, created_at, updated_at,
   parent_vehicle_id, COALESCE(is_paint_variant, 0),
   boost_speed_back, angular_velocity_pitch, angular_velocity_yaw,
   angular_velocity_roll, fuel_capacity_hydrogen, fuel_capacity_quantum,
   thruster_count_main, thruster_count_maneuvering, acquisition_type
FROM vehicles_old;

DROP TABLE vehicles_old;

-- ──────────────────────────────────────────────────────────────
-- 2.3  vehicle_components  (was `components`, renamed in 0017)
--      Was: uuid TEXT UNIQUE NOT NULL, game_version_id nullable
--      Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicle_components RENAME TO vehicle_components_old;

CREATE TABLE vehicle_components (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  class_name      TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  type            TEXT    NOT NULL,
  sub_type        TEXT,
  size            INTEGER,
  grade           TEXT,
  description     TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data        TEXT,
  stats_json      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO vehicle_components
  (id, uuid, name, slug, class_name, manufacturer_id, type, sub_type, size, grade,
   description, game_version_id, raw_data, stats_json, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, type, sub_type, size, grade,
   description,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, stats_json, created_at, updated_at
FROM vehicle_components_old;

DROP TABLE vehicle_components_old;

-- ──────────────────────────────────────────────────────────────
-- 2.4  fps_weapons
--      Was: uuid TEXT UNIQUE NOT NULL, game_version_id nullable
--      Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_weapons RENAME TO fps_weapons_old;

CREATE TABLE fps_weapons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  class_name      TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  sub_type        TEXT,
  size            INTEGER,
  description     TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data        TEXT,
  stats_json      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_weapons
  (id, uuid, name, slug, class_name, manufacturer_id, sub_type, size,
   description, game_version_id, raw_data, stats_json, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, sub_type, size,
   description,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, stats_json, created_at, updated_at
FROM fps_weapons_old;

DROP TABLE fps_weapons_old;

-- ──────────────────────────────────────────────────────────────
-- 2.5  fps_armour
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_armour RENAME TO fps_armour_old;

CREATE TABLE fps_armour (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  class_name      TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  sub_type        TEXT,
  size            INTEGER,
  grade           TEXT,
  description     TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data        TEXT,
  stats_json      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_armour
  (id, uuid, name, slug, class_name, manufacturer_id, sub_type, size, grade,
   description, game_version_id, raw_data, stats_json, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, sub_type, size, grade,
   description,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, stats_json, created_at, updated_at
FROM fps_armour_old;

DROP TABLE fps_armour_old;

-- ──────────────────────────────────────────────────────────────
-- 2.6  fps_attachments
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_attachments RENAME TO fps_attachments_old;

CREATE TABLE fps_attachments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  class_name      TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  sub_type        TEXT,
  size            INTEGER,
  description     TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data        TEXT,
  stats_json      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_attachments
  (id, uuid, name, slug, class_name, manufacturer_id, sub_type, size,
   description, game_version_id, raw_data, stats_json, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, sub_type, size,
   description,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, stats_json, created_at, updated_at
FROM fps_attachments_old;

DROP TABLE fps_attachments_old;

-- ──────────────────────────────────────────────────────────────
-- 2.7  fps_utilities
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_utilities RENAME TO fps_utilities_old;

CREATE TABLE fps_utilities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  class_name      TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  sub_type        TEXT,
  description     TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  raw_data        TEXT,
  stats_json      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_utilities
  (id, uuid, name, slug, class_name, manufacturer_id, sub_type,
   description, game_version_id, raw_data, stats_json, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, sub_type,
   description,
   COALESCE(game_version_id, (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')),
   raw_data, stats_json, created_at, updated_at
FROM fps_utilities_old;

DROP TABLE fps_utilities_old;

-- ──────────────────────────────────────────────────────────────
-- 2.8  fps_helmets
--      Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--      Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_helmets RENAME TO fps_helmets_old;

CREATE TABLE fps_helmets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  sub_type        TEXT,
  size            REAL,
  grade           TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_helmets
  (id, uuid, class_name, name, slug, description, sub_type, size, grade,
   manufacturer_id, stats_json, game_version_id, created_at, updated_at)
SELECT id, uuid, class_name, name, slug, description, sub_type, size, grade,
   manufacturer_id, stats_json,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at, updated_at
FROM fps_helmets_old;

DROP TABLE fps_helmets_old;

CREATE INDEX IF NOT EXISTS idx_fps_helmets_sub_type ON fps_helmets(sub_type);
CREATE INDEX IF NOT EXISTS idx_fps_helmets_slug     ON fps_helmets(slug);

-- ──────────────────────────────────────────────────────────────
-- 2.9  fps_clothing
--      Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--      Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_clothing RENAME TO fps_clothing_old;

CREATE TABLE fps_clothing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  slot            TEXT,
  size            REAL,
  grade           TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO fps_clothing
  (id, uuid, class_name, name, slug, description, slot, size, grade,
   manufacturer_id, stats_json, game_version_id, created_at, updated_at)
SELECT id, uuid, class_name, name, slug, description, slot, size, grade,
   manufacturer_id, stats_json,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at, updated_at
FROM fps_clothing_old;

DROP TABLE fps_clothing_old;

CREATE INDEX IF NOT EXISTS idx_fps_clothing_slot ON fps_clothing(slot);
CREATE INDEX IF NOT EXISTS idx_fps_clothing_slug ON fps_clothing(slug);

-- ──────────────────────────────────────────────────────────────
-- 2.10  consumables
--       Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--       Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE consumables RENAME TO consumables_old;

CREATE TABLE consumables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  type            TEXT,
  sub_type        TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO consumables
  (id, uuid, class_name, name, slug, description, type, sub_type,
   manufacturer_id, stats_json, game_version_id, created_at, updated_at)
SELECT id, uuid, class_name, name, slug, description, type, sub_type,
   manufacturer_id, stats_json,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at, updated_at
FROM consumables_old;

DROP TABLE consumables_old;

CREATE INDEX IF NOT EXISTS idx_consumables_type     ON consumables(type);
CREATE INDEX IF NOT EXISTS idx_consumables_sub_type ON consumables(sub_type);
CREATE INDEX IF NOT EXISTS idx_consumables_slug     ON consumables(slug);

-- ──────────────────────────────────────────────────────────────
-- 2.11  harvestables
--       Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--       Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE harvestables RENAME TO harvestables_old;

CREATE TABLE harvestables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  sub_type        TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO harvestables
  (id, uuid, class_name, name, slug, description, sub_type,
   game_version_id, created_at, updated_at)
SELECT id, uuid, class_name, name, slug, description, sub_type,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at, updated_at
FROM harvestables_old;

DROP TABLE harvestables_old;

CREATE INDEX IF NOT EXISTS idx_harvestables_slug ON harvestables(slug);

-- ──────────────────────────────────────────────────────────────
-- 2.12  props
--       Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--       Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE props RENAME TO props_old;

CREATE TABLE props (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  type            TEXT,
  sub_type        TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO props
  (id, uuid, class_name, name, slug, description, type, sub_type,
   manufacturer_id, game_version_id, created_at, updated_at)
SELECT id, uuid, class_name, name, slug, description, type, sub_type,
   manufacturer_id,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at, updated_at
FROM props_old;

DROP TABLE props_old;

CREATE INDEX IF NOT EXISTS idx_props_sub_type ON props(sub_type);
CREATE INDEX IF NOT EXISTS idx_props_slug     ON props(slug);

-- ──────────────────────────────────────────────────────────────
-- 2.13  loot_map
--       Was: uuid TEXT NOT NULL UNIQUE  (no game_version_id column)
--       Now: UNIQUE(uuid, game_version_id)
--
--       FK columns (vehicle_component_id, fps_weapon_id, etc.) reference integer
--       IDs that are preserved in the rebuilt item tables above, so no FK fix needed.
--       user_loot_collection references loot_map(id) — IDs preserved here too.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE loot_map RENAME TO loot_map_old;

CREATE TABLE loot_map (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                 TEXT    NOT NULL,
  name                 TEXT    NOT NULL,
  class_name           TEXT,
  type                 TEXT,
  sub_type             TEXT,
  rarity               TEXT,
  vehicle_component_id INTEGER REFERENCES vehicle_components(id),
  fps_weapon_id        INTEGER REFERENCES fps_weapons(id),
  fps_armour_id        INTEGER REFERENCES fps_armour(id),
  fps_attachment_id    INTEGER REFERENCES fps_attachments(id),
  fps_utility_id       INTEGER REFERENCES fps_utilities(id),
  fps_helmet_id        INTEGER REFERENCES fps_helmets(id),
  fps_clothing_id      INTEGER REFERENCES fps_clothing(id),
  consumable_id        INTEGER REFERENCES consumables(id),
  harvestable_id       INTEGER REFERENCES harvestables(id),
  props_id             INTEGER REFERENCES props(id),
  containers_json      TEXT,
  npcs_json            TEXT,
  shops_json           TEXT,
  corpses_json         TEXT,
  contracts_json       TEXT,
  game_version_id      INTEGER NOT NULL REFERENCES game_versions(id),
  updated_at           TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

INSERT INTO loot_map
  (id, uuid, name, class_name, type, sub_type, rarity,
   vehicle_component_id, fps_weapon_id, fps_armour_id, fps_attachment_id, fps_utility_id,
   fps_helmet_id, fps_clothing_id, consumable_id, harvestable_id, props_id,
   containers_json, npcs_json, shops_json, corpses_json, contracts_json,
   game_version_id, updated_at)
SELECT id, uuid, name, class_name, type, sub_type, rarity,
   vehicle_component_id, fps_weapon_id, fps_armour_id, fps_attachment_id, fps_utility_id,
   fps_helmet_id, fps_clothing_id, consumable_id, harvestable_id, props_id,
   containers_json, npcs_json, shops_json, corpses_json, contracts_json,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   updated_at
FROM loot_map_old;

DROP TABLE loot_map_old;

CREATE INDEX IF NOT EXISTS idx_loot_map_type         ON loot_map(type);
CREATE INDEX IF NOT EXISTS idx_loot_map_sub_type     ON loot_map(sub_type);
CREATE INDEX IF NOT EXISTS idx_loot_map_rarity       ON loot_map(rarity);
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_helmet   ON loot_map(fps_helmet_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_clothing ON loot_map(fps_clothing_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_consumable   ON loot_map(consumable_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_harvestable  ON loot_map(harvestable_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_props        ON loot_map(props_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_game_version ON loot_map(game_version_id);

-- ──────────────────────────────────────────────────────────────
-- 2.14  contracts
--       Was: contract_key TEXT NOT NULL UNIQUE  (no game_version_id column)
--       Now: UNIQUE(contract_key, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE contracts RENAME TO contracts_old;

CREATE TABLE contracts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_key     TEXT    NOT NULL,
  giver            TEXT    NOT NULL,
  giver_slug       TEXT    NOT NULL,
  category         TEXT    NOT NULL,
  sequence_num     INTEGER,
  title            TEXT    NOT NULL,
  description      TEXT,
  reward_text      TEXT,
  reward_amount    INTEGER DEFAULT 0,
  reward_currency  TEXT,
  is_dynamic_reward INTEGER DEFAULT 0,
  is_active        INTEGER DEFAULT 1,
  notes            TEXT,
  game_version_id  INTEGER NOT NULL REFERENCES game_versions(id),
  UNIQUE(contract_key, game_version_id)
);

INSERT INTO contracts
  (id, contract_key, giver, giver_slug, category, sequence_num, title, description,
   reward_text, reward_amount, reward_currency, is_dynamic_reward, is_active, notes,
   game_version_id)
SELECT id, contract_key, giver, giver_slug, category, sequence_num, title, description,
   reward_text, reward_amount, reward_currency, is_dynamic_reward, is_active, notes,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298')
FROM contracts_old;

DROP TABLE contracts_old;

CREATE INDEX IF NOT EXISTS idx_contracts_giver_slug ON contracts(giver_slug);
CREATE INDEX IF NOT EXISTS idx_contracts_is_active  ON contracts(is_active);

-- ──────────────────────────────────────────────────────────────
-- 2.15  vehicle_ports
--       Was: uuid TEXT UNIQUE NOT NULL  (no game_version_id column)
--       Now: UNIQUE(uuid, game_version_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicle_ports RENAME TO vehicle_ports_old;

CREATE TABLE vehicle_ports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid               TEXT    NOT NULL,
  vehicle_id         INTEGER NOT NULL REFERENCES vehicles(id),
  parent_port_id     INTEGER REFERENCES vehicle_ports(id),
  name               TEXT    NOT NULL,
  position           TEXT,
  category_label     TEXT,
  size_min           INTEGER,
  size_max           INTEGER,
  port_type          TEXT,
  port_subtype       TEXT,
  equipped_item_uuid TEXT,
  editable           BOOLEAN DEFAULT TRUE,
  health             REAL,
  game_version_id    INTEGER NOT NULL REFERENCES game_versions(id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, game_version_id)
);

INSERT INTO vehicle_ports
  (id, uuid, vehicle_id, parent_port_id, name, position, category_label,
   size_min, size_max, port_type, port_subtype, equipped_item_uuid,
   editable, health, game_version_id, created_at)
SELECT id, uuid, vehicle_id, parent_port_id, name, position, category_label,
   size_min, size_max, port_type, port_subtype, equipped_item_uuid,
   editable, health,
   (SELECT id FROM game_versions WHERE code = '4.6.0-live.11319298'),
   created_at
FROM vehicle_ports_old;

DROP TABLE vehicle_ports_old;

CREATE INDEX IF NOT EXISTS idx_vehicle_ports_vehicle_id    ON vehicle_ports(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ports_parent_port_id ON vehicle_ports(parent_port_id);
