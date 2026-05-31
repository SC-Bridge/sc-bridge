-- 0250_mineable_rock_entities.sql
--
-- Per-rock base values consumed by the rewritten Rock Calculator. Each row
-- corresponds to one mineable rock entity (267 in 4.8.0-live, under
-- DataCore/libs/foundry/records/entities/mineable/*.json).
--
-- composition_uuid is the FK to rock_compositions -- multiple rock entities
-- typically share one composition preset (e.g. ten atacamite variants all
-- point at the same Atacamite Deposit composition tree, varying by dominant
-- element).
--
-- laser_damage_full_value: base resistance the player's laser must overcome.
--   Source: SMineableHealthComponentParams.damageMapParamsCenter.laserDamageFullValue
-- damage_strength_power_curve: shape of damage transfer with throttle.
--   Source: SMineableHealthComponentParams.damageMapParamsCenter.damageStrengthPowerCurve
-- filled_factor: extraction multiplier (typically 1.0 in current 4.8.0 data,
--   but stored for forward-compat).
--   Source: MineableParams.filledFactor
-- rock_category: 'ship_asteroid' | 'ship_planetary' | 'fps' | 'ground_vehicle'.
--   Classified by the extractor based on entity filename prefix.

CREATE TABLE mineable_rock_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL,
  composition_uuid TEXT NOT NULL,
  rock_category TEXT,
  laser_damage_full_value REAL,
  damage_strength_power_curve REAL,
  filled_factor REAL,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT
);

CREATE INDEX idx_mineable_rock_entities_composition
  ON mineable_rock_entities(composition_uuid);
CREATE INDEX idx_mineable_rock_entities_class
  ON mineable_rock_entities(class_name);
CREATE INDEX idx_mineable_rock_entities_category
  ON mineable_rock_entities(rock_category);

-- PTU shadow -- fresh table, but use DROP+CREATE for idempotency in case a
-- partial earlier apply left a stale shape.
DROP TABLE IF EXISTS ptu_mineable_rock_entities;

CREATE TABLE IF NOT EXISTS ptu_mineable_rock_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL,
  composition_uuid TEXT NOT NULL,
  rock_category TEXT,
  laser_damage_full_value REAL,
  damage_strength_power_curve REAL,
  filled_factor REAL,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT
);

CREATE INDEX IF NOT EXISTS ptu_idx_mineable_rock_entities_composition
  ON ptu_mineable_rock_entities(composition_uuid);
CREATE INDEX IF NOT EXISTS ptu_idx_mineable_rock_entities_class
  ON ptu_mineable_rock_entities(class_name);
CREATE INDEX IF NOT EXISTS ptu_idx_mineable_rock_entities_category
  ON ptu_mineable_rock_entities(rock_category);
