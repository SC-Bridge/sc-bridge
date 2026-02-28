CREATE TABLE IF NOT EXISTS fps_helmets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  sub_type        TEXT,   -- 'Light' | 'Medium' | 'Heavy'
  size            REAL,
  grade           TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fps_helmets_sub_type ON fps_helmets(sub_type);
CREATE INDEX IF NOT EXISTS idx_fps_helmets_slug     ON fps_helmets(slug);
