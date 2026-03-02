-- Fix user_loot_collection FK: migration 0037 renamed loot_map→loot_map_old, SQLite updated
-- the FK reference automatically. When loot_map_old was later dropped the FK target disappeared,
-- causing every INSERT to fail with "no such table: main.loot_map_old".
-- Rebuild the table with an explicit FK to loot_map(id) and preserve the quantity column from 0039.

PRAGMA foreign_keys=OFF;

CREATE TABLE user_loot_collection_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  loot_map_id INTEGER NOT NULL REFERENCES loot_map(id),
  collected_at TEXT DEFAULT (datetime('now')),
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, loot_map_id)
);

INSERT INTO user_loot_collection_new (id, user_id, loot_map_id, collected_at, quantity)
SELECT id, user_id, loot_map_id, collected_at, quantity FROM user_loot_collection;

DROP TABLE user_loot_collection;
ALTER TABLE user_loot_collection_new RENAME TO user_loot_collection;

CREATE INDEX idx_user_loot_collection_user ON user_loot_collection(user_id);
CREATE INDEX idx_user_loot_collection_item ON user_loot_collection(loot_map_id);

PRAGMA foreign_keys=ON;
