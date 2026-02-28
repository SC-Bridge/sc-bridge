CREATE TABLE IF NOT EXISTS loot_map (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  class_name   TEXT,
  type         TEXT,
  sub_type     TEXT,
  rarity       TEXT,

  -- Cross-references to item tables (nullable — most loot items won't match)
  vehicle_component_id INTEGER REFERENCES vehicle_components(id),
  fps_weapon_id        INTEGER REFERENCES fps_weapons(id),
  fps_armour_id        INTEGER REFERENCES fps_armour(id),
  fps_attachment_id    INTEGER REFERENCES fps_attachments(id),
  fps_utility_id       INTEGER REFERENCES fps_utilities(id),

  -- Source data — stored as JSON arrays to avoid schema churn
  containers_json TEXT,
  npcs_json       TEXT,
  shops_json      TEXT,
  corpses_json    TEXT,
  contracts_json  TEXT,

  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loot_map_type     ON loot_map(type);
CREATE INDEX IF NOT EXISTS idx_loot_map_sub_type ON loot_map(sub_type);
CREATE INDEX IF NOT EXISTS idx_loot_map_rarity   ON loot_map(rarity);
