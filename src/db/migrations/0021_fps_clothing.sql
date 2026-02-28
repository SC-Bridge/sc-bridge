CREATE TABLE IF NOT EXISTS fps_clothing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  slot            TEXT,   -- 'Hat' | 'Feet' | 'Hands' | 'Legs' | 'Torso_0' | 'Torso_1' | 'Torso_2' | 'Backpack'
  size            REAL,
  grade           TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fps_clothing_slot ON fps_clothing(slot);
CREATE INDEX IF NOT EXISTS idx_fps_clothing_slug ON fps_clothing(slug);
