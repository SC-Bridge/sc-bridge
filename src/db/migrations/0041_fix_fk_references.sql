-- 0041_fix_fk_references.sql
--
-- Fix broken FK references caused by SQLite 3.26+ auto-renaming behaviour
-- during migration 0037.
--
-- Migration 0037 renamed game-data tables to _old (e.g. vehicles → vehicles_old),
-- rebuilt them, then dropped the _old versions. SQLite 3.26+ automatically updates
-- FK references in OTHER tables when a table is renamed — so all tables that had
-- REFERENCES vehicles(id), REFERENCES manufacturers(id), etc. had their FK text
-- silently rewritten to vehicles_old, manufacturers_old, etc. When the _old tables
-- were dropped, those FK references became dangling, causing SQLITE_ERROR on INSERT.
--
-- Tables affected:
--   user_fleet           — vehicle_id REFERENCES vehicles_old(id)
--   paint_vehicles       — vehicle_id REFERENCES vehicles_old(id)
--   vehicle_loaners      — vehicle_id, loaner_id REFERENCES vehicles_old(id)
--   vehicle_images       — vehicle_id REFERENCES vehicles_old(id) ON DELETE CASCADE
--   vehicle_images_archive — vehicle_id REFERENCES vehicles_old(id) ON DELETE CASCADE
--   fps_ammo             — manufacturer_id REFERENCES manufacturers_old(id)
--
-- Fix pattern for each: rename → recreate with correct FK → copy data → drop old.
--
-- NOTE: PRAGMA foreign_keys = OFF is a no-op inside D1's transaction wrapper.
-- The INSERT steps rely on the fact that all copied vehicle_id / manufacturer_id
-- values reference IDs that exist in the current vehicles / manufacturers tables
-- (IDs were preserved by migration 0037's INSERT … SELECT id, … pattern).

-- ──────────────────────────────────────────────────────────────
-- 1.  user_fleet
-- ──────────────────────────────────────────────────────────────

ALTER TABLE user_fleet RENAME TO user_fleet_old;

CREATE TABLE user_fleet (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           TEXT    NOT NULL,
    vehicle_id        INTEGER NOT NULL REFERENCES vehicles(id),
    insurance_type_id INTEGER REFERENCES insurance_types(id),
    warbond           BOOLEAN NOT NULL DEFAULT FALSE,
    is_loaner         BOOLEAN NOT NULL DEFAULT FALSE,
    pledge_id         TEXT,
    pledge_name       TEXT,
    pledge_cost       TEXT,
    pledge_date       TEXT,
    custom_name       TEXT,
    equipped_paint_id INTEGER REFERENCES paints(id),
    imported_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    org_visibility    TEXT    NOT NULL DEFAULT 'private',
    available_for_ops INTEGER NOT NULL DEFAULT 0
);

INSERT INTO user_fleet
    (id, user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
     pledge_id, pledge_name, pledge_cost, pledge_date, custom_name,
     equipped_paint_id, imported_at, org_visibility, available_for_ops)
SELECT id, user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
     pledge_id, pledge_name, pledge_cost, pledge_date, custom_name,
     equipped_paint_id, imported_at, org_visibility, available_for_ops
FROM user_fleet_old;

DROP TABLE user_fleet_old;

CREATE INDEX IF NOT EXISTS idx_user_fleet_user_id ON user_fleet(user_id);

-- ──────────────────────────────────────────────────────────────
-- 2.  paint_vehicles
-- ──────────────────────────────────────────────────────────────

ALTER TABLE paint_vehicles RENAME TO paint_vehicles_old;

CREATE TABLE paint_vehicles (
    paint_id   INTEGER NOT NULL REFERENCES paints(id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    PRIMARY KEY (paint_id, vehicle_id)
);

INSERT INTO paint_vehicles (paint_id, vehicle_id)
SELECT paint_id, vehicle_id FROM paint_vehicles_old;

DROP TABLE paint_vehicles_old;

-- ──────────────────────────────────────────────────────────────
-- 3.  vehicle_loaners
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicle_loaners RENAME TO vehicle_loaners_old;

CREATE TABLE vehicle_loaners (
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    loaner_id  INTEGER NOT NULL REFERENCES vehicles(id),
    PRIMARY KEY (vehicle_id, loaner_id)
);

INSERT INTO vehicle_loaners (vehicle_id, loaner_id)
SELECT vehicle_id, loaner_id FROM vehicle_loaners_old;

DROP TABLE vehicle_loaners_old;

-- ──────────────────────────────────────────────────────────────
-- 4.  vehicle_images
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicle_images RENAME TO vehicle_images_old;

CREATE TABLE vehicle_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    cf_images_id TEXT,
    UNIQUE(vehicle_id)
);

INSERT INTO vehicle_images (id, vehicle_id, created_at, updated_at, cf_images_id)
SELECT id, vehicle_id, created_at, updated_at, cf_images_id
FROM vehicle_images_old;

DROP TABLE vehicle_images_old;

-- ──────────────────────────────────────────────────────────────
-- 5.  vehicle_images_archive
-- ──────────────────────────────────────────────────────────────

ALTER TABLE vehicle_images_archive RENAME TO vehicle_images_archive_old;

CREATE TABLE vehicle_images_archive (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    rsi_id      INTEGER,
    rsi_slug    TEXT,
    rsi_cdn_new TEXT,
    rsi_cdn_old TEXT,
    rsi_graphql TEXT,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO vehicle_images_archive
    (id, vehicle_id, rsi_id, rsi_slug, rsi_cdn_new, rsi_cdn_old, rsi_graphql, archived_at)
SELECT id, vehicle_id, rsi_id, rsi_slug, rsi_cdn_new, rsi_cdn_old, rsi_graphql, archived_at
FROM vehicle_images_archive_old;

DROP TABLE vehicle_images_archive_old;

-- ──────────────────────────────────────────────────────────────
-- 6.  fps_ammo
-- ──────────────────────────────────────────────────────────────

ALTER TABLE fps_ammo RENAME TO fps_ammo_old;

CREATE TABLE fps_ammo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    slug            TEXT,
    class_name      TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    sub_type        TEXT,
    description     TEXT,
    game_version_id INTEGER REFERENCES game_versions(id),
    raw_data        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO fps_ammo
    (id, uuid, name, slug, class_name, manufacturer_id, sub_type,
     description, game_version_id, raw_data, created_at, updated_at)
SELECT id, uuid, name, slug, class_name, manufacturer_id, sub_type,
     description, game_version_id, raw_data, created_at, updated_at
FROM fps_ammo_old;

DROP TABLE fps_ammo_old;
