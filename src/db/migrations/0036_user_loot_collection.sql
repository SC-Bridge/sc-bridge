-- User loot collection tracking
CREATE TABLE user_loot_collection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  loot_map_id INTEGER NOT NULL REFERENCES loot_map(id),
  collected_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, loot_map_id)
);
CREATE INDEX idx_user_loot_collection_user ON user_loot_collection(user_id);
CREATE INDEX idx_user_loot_collection_item ON user_loot_collection(loot_map_id);
