CREATE TABLE IF NOT EXISTS props (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  type            TEXT,   -- Misc (all current entries)
  sub_type        TEXT,   -- Personal | Trophy | Utility | Junk | Mineable | UNDEFINED | etc.
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_props_sub_type ON props(sub_type);
CREATE INDEX IF NOT EXISTS idx_props_slug     ON props(slug);
