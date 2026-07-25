-- 0271_user_item_builds
--
-- Slice 2 (#200 follow-up): the bench is a LOADOUT bench — armour and weapons
-- are both things you wear. One generalized builds store replaces
-- user_weapon_builds: rows copied with ids PRESERVED (sqlite bumps
-- sqlite_sequence to max(id) on explicit-id insert), the loadout-slot FK is
-- repointed via the SQLite rebuild-and-copy dance, and the old table dropped.

CREATE TABLE user_item_builds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('weapon','armour')),
  item_uuid   TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  config_json TEXT    NOT NULL,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_item_builds_user ON user_item_builds(user_id);
CREATE UNIQUE INDEX idx_user_item_builds_unique
  ON user_item_builds(user_id, kind, item_uuid, name);

INSERT INTO user_item_builds (id, user_id, kind, item_uuid, name, config_json, created_at, updated_at)
SELECT id, user_id, 'weapon', weapon_uuid, name, config_json, created_at, updated_at
FROM user_weapon_builds;

CREATE TABLE user_fps_loadout_slots_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  loadout_id    INTEGER NOT NULL REFERENCES user_fps_loadouts(id) ON DELETE CASCADE,
  slot_key      TEXT    NOT NULL,
  item_uuid     TEXT,
  item_name     TEXT,
  item_build_id INTEGER REFERENCES user_item_builds(id) ON DELETE SET NULL,
  config_json   TEXT,
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(loadout_id, slot_key)
);
INSERT INTO user_fps_loadout_slots_new (id, loadout_id, slot_key, item_uuid, item_name, item_build_id, config_json, updated_at)
SELECT id, loadout_id, slot_key, item_uuid, item_name, weapon_build_id, config_json, updated_at
FROM user_fps_loadout_slots;
DROP TABLE user_fps_loadout_slots;
ALTER TABLE user_fps_loadout_slots_new RENAME TO user_fps_loadout_slots;
CREATE INDEX idx_ufls_loadout ON user_fps_loadout_slots(loadout_id);

DROP TABLE user_weapon_builds;
