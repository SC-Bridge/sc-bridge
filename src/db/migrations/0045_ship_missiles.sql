-- Migration 0045: ship_missiles table + loot_map FK
-- Stores actual missile/torpedo projectiles (NOT missile racks — those are in vehicle_components)
-- Source: DataCore ships/weapons/missiles/

CREATE TABLE ship_missiles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL,
  class_name      TEXT,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  type            TEXT,
  sub_type        TEXT,
  size            INTEGER,
  grade           TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  stats_json      TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, game_version_id)
);

CREATE INDEX idx_ship_missiles_uuid ON ship_missiles(uuid);
CREATE INDEX idx_ship_missiles_type ON ship_missiles(type, sub_type);
CREATE INDEX idx_ship_missiles_size ON ship_missiles(size);

-- Add FK column to loot_map
ALTER TABLE loot_map ADD COLUMN ship_missile_id INTEGER REFERENCES ship_missiles(id);
CREATE INDEX idx_loot_map_ship_missile ON loot_map(ship_missile_id);
