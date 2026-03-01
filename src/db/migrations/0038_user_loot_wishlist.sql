-- 0038_user_loot_wishlist.sql
-- User wishlist for loot items — tracks items the user wants to acquire.
-- Enables shopping list view showing consolidated locations per wishlisted item.

CREATE TABLE user_loot_wishlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  loot_map_id INTEGER NOT NULL REFERENCES loot_map(id),
  added_at    TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, loot_map_id)
);

CREATE INDEX idx_user_loot_wishlist_user ON user_loot_wishlist(user_id);
CREATE INDEX idx_user_loot_wishlist_item ON user_loot_wishlist(loot_map_id);
