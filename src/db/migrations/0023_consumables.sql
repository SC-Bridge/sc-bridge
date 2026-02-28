CREATE TABLE IF NOT EXISTS consumables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE,
  class_name      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  slug            TEXT,
  description     TEXT,
  type            TEXT,   -- 'Food' | 'Drink'
  sub_type        TEXT,   -- 'Bottle' | 'Can' | 'Bar' | 'Sachet' | 'Tin' | 'Box' | 'Junk' | etc.
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  stats_json      TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consumables_type     ON consumables(type);
CREATE INDEX IF NOT EXISTS idx_consumables_sub_type ON consumables(sub_type);
CREATE INDEX IF NOT EXISTS idx_consumables_slug     ON consumables(slug);
