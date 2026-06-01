-- 0249_rock_compositions_deposit_name.sql
--
-- Add deposit_name column on rock_compositions. The value is the localized
-- string the player sees on scan (e.g. "Atacamite Deposit", "Asteroid (C-Type)"),
-- resolved from composition._RecordValue_.depositName via global.ini.
-- Allows the Rock Calculator picker to group compositions by their
-- player-facing name instead of internal slug.
--
-- PTU shadow uses DROP+CREATE per the SQLite-ALTER-no-IF-EXISTS lesson —
-- ptu_rock_compositions may be missing on staging/prod after a major LIVE
-- transition.
--
-- Full column list mirrors rock_compositions as of migration 0248 plus
-- the new deposit_name column (added via ALTER TABLE on the live table).

ALTER TABLE rock_compositions ADD COLUMN deposit_name TEXT;

CREATE INDEX IF NOT EXISTS idx_rock_compositions_deposit_name
  ON rock_compositions(deposit_name)
  WHERE deposit_name IS NOT NULL;

DROP TABLE IF EXISTS ptu_rock_compositions;

CREATE TABLE IF NOT EXISTS ptu_rock_compositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT,
  class_name TEXT,
  rock_type TEXT,
  min_elements INTEGER,
  composition_json TEXT,
  deposit_name TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  removed INTEGER NOT NULL DEFAULT 0,
  data_source TEXT,
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT
);

CREATE INDEX IF NOT EXISTS ptu_idx_rock_compositions_deposit_name
  ON ptu_rock_compositions(deposit_name)
  WHERE deposit_name IS NOT NULL;

-- Mirror the rock_type index that existed on ptu_rock_compositions in 0215
-- (lost when this migration DROPped+CREATEd the shadow). Live rock_compositions
-- still has its idx_rock_compositions_rock_type — keep the shadow in parity.
CREATE INDEX IF NOT EXISTS ptu_idx_rock_compositions_rock_type
  ON ptu_rock_compositions(rock_type);
