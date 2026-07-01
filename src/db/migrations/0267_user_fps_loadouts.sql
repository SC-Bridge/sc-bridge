-- 0267_user_fps_loadouts
--
-- Named FPS loadouts (kits) + per-slot items (#200 follow-up). A slot points at
-- a base item (item_uuid) and optionally a crafted weapon design
-- (weapon_build_id → user_weapon_builds) or an inline config. Owned/aspirational
-- is NOT stored here — it's derived from the user's Loot collection/wishlist at
-- read time. Mirrors user_weapon_builds (0264) for the per-user/named pattern.

CREATE TABLE user_fps_loadouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_user_fps_loadouts_user ON user_fps_loadouts(user_id);

CREATE TABLE user_fps_loadout_slots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  loadout_id      INTEGER NOT NULL REFERENCES user_fps_loadouts(id) ON DELETE CASCADE,
  slot_key        TEXT    NOT NULL,   -- primary|secondary|sidearm|helmet|core|arms|legs|backpack|undersuit|medical|gadget|throwable
  item_uuid       TEXT,
  item_name       TEXT,
  weapon_build_id INTEGER REFERENCES user_weapon_builds(id) ON DELETE SET NULL,
  config_json     TEXT,
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(loadout_id, slot_key)
);
CREATE INDEX idx_ufls_loadout ON user_fps_loadout_slots(loadout_id);
