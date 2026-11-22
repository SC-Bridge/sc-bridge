-- Index of published game renders (WebP files on R2).
--
-- One row per render. Not game-version keyed: renders follow LIVE and a patch
-- rewrites rows. Joined to site records by value (item_key = class_name), never
-- by foreign key, so a patch that renumbers rows does not break the link.
-- A paint is a vehicle row with a variant: ('vehicle', 'aegs_gladius',
-- 'paint_gladius_valiant', 'iso'). The table holds no user data.

CREATE TABLE IF NOT EXISTS item_renders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT NOT NULL,            -- 'vehicle', 'fps_weapon', 'armour_set', ...
  item_key       TEXT NOT NULL,            -- class_name; armour sets use the sorted, comma-joined lower-case piece class_names (undersuits excluded)
  variant        TEXT NOT NULL DEFAULT '', -- '' = stock; a paint or finish class_name otherwise
  view           TEXT NOT NULL,            -- 'iso' | 'side' | 'worn_male' | 'worn_female'
  hash           TEXT NOT NULL,            -- R2 key prefix
  width          INTEGER NOT NULL,         -- of the 2048 file, after crop
  height         INTEGER NOT NULL,
  source_version TEXT NOT NULL,            -- game build the render came from, e.g. '4.10.3-live'
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE (kind, item_key, variant, view)
);

CREATE INDEX IF NOT EXISTS idx_item_renders_variant ON item_renders(variant);
CREATE INDEX IF NOT EXISTS idx_item_renders_item_key ON item_renders(item_key, variant);
