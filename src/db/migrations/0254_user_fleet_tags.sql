-- 0254_user_fleet_tags
--
-- Per-user custom tags on fleet entries (#120). Lets users group/organise their
-- ships with arbitrary labels (e.g. "cargo", "CCU-avoid", "ground ops"). Tags
-- are free-text, scoped to a single user_fleet row, and de-duplicated per ship
-- via the UNIQUE(user_fleet_id, tag) constraint.
--
-- user_id is denormalised (also derivable via user_fleet.user_id) so account
-- deletion and the per-user hydration query can hit an index without joining
-- user_fleet. ON DELETE CASCADE on user_fleet_id cleans tags when a ship leaves
-- the fleet (re-import insert-then-swap, manual removal).

CREATE TABLE IF NOT EXISTS user_fleet_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_fleet_id INTEGER NOT NULL REFERENCES user_fleet(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_fleet_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_user_fleet_tags_user_id ON user_fleet_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_fleet_tags_fleet_id ON user_fleet_tags(user_fleet_id);
