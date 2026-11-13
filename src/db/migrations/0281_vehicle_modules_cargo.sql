-- Per-module cargo for modular ships.
--
-- vehicles.cargo is the hull as it ships (bare hull + whatever modules are
-- fitted by default). A swappable module carries its own cargo grids, so each
-- vehicle_modules row gets the SCU of the grids in that module's own loadout
-- (Retaliator cargo modules, Galaxy cargo / medical modules). NULL = the module
-- has no cargo grid. The site shows hull + (equipped module - default module).
--
-- 1. PTU shadow table. Rebuilt rather than ALTERed so this half cannot fail on
--    a re-run, nor when the shadow table has been dropped by a PTU purge
--    (DELETE /api/admin/versions/ptu): the first statement recreates the
--    pre-cargo shape if it is missing. A re-run resets PTU cargo to NULL until
--    the next PTU load. Nothing references this table by foreign key.
--    Row writes = current ptu_vehicle_modules rows (one copy each; 0 today).
CREATE TABLE IF NOT EXISTS ptu_vehicle_modules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  vehicle_id      INTEGER NOT NULL REFERENCES ptu_vehicles(id),
  port_name       TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  display_name    TEXT,
  size            INTEGER,
  tags            TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0,
  has_loadout     INTEGER NOT NULL DEFAULT 0,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  removed         INTEGER NOT NULL DEFAULT 0,
  data_source     TEXT,
  is_deleted      INTEGER DEFAULT 0,
  deleted_at      TEXT,
  deleted_in_patch TEXT,
  UNIQUE(uuid, vehicle_id)
);

DROP TABLE IF EXISTS ptu_vehicle_modules_new;

CREATE TABLE ptu_vehicle_modules_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  vehicle_id      INTEGER NOT NULL REFERENCES ptu_vehicles(id),
  port_name       TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  display_name    TEXT,
  size            INTEGER,
  tags            TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0,
  has_loadout     INTEGER NOT NULL DEFAULT 0,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  removed         INTEGER NOT NULL DEFAULT 0,
  data_source     TEXT,
  is_deleted      INTEGER DEFAULT 0,
  deleted_at      TEXT,
  deleted_in_patch TEXT,
  cargo           REAL,
  UNIQUE(uuid, vehicle_id)
);

INSERT INTO ptu_vehicle_modules_new
  (id, uuid, vehicle_id, port_name, class_name, display_name, size, tags, is_default,
   has_loadout, game_version_id, created_at, removed, data_source, is_deleted, deleted_at, deleted_in_patch)
SELECT id, uuid, vehicle_id, port_name, class_name, display_name, size, tags, is_default,
       has_loadout, game_version_id, created_at, removed, data_source, is_deleted, deleted_at, deleted_in_patch
FROM ptu_vehicle_modules;

DROP TABLE ptu_vehicle_modules;

ALTER TABLE ptu_vehicle_modules_new RENAME TO ptu_vehicle_modules;

CREATE INDEX IF NOT EXISTS ptu_idx_vehicle_modules_port ON ptu_vehicle_modules(vehicle_id, port_name);
CREATE INDEX IF NOT EXISTS ptu_idx_vehicle_modules_vehicle ON ptu_vehicle_modules(vehicle_id);
CREATE INDEX IF NOT EXISTS ptu_idx_vehicle_modules_version ON ptu_vehicle_modules(game_version_id);

-- 2. Base table. Kept last on purpose.
--    NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. Applied once by
--    wrangler; if ever re-run by hand, skip this statement when
--    pragma_table_info('vehicle_modules') already lists cargo (everything
--    above it is safe to repeat). Adds a nullable column: zero row writes.
ALTER TABLE vehicle_modules ADD COLUMN cargo REAL;
