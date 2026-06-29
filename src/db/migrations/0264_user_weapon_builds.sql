-- 0264_user_weapon_builds
--
-- Saved weapon-bench builds (#200). A build = a weapon + its per-material crafting
-- quality config + equipped attachments, captured as a single JSON blob so the
-- shape can evolve without schema churn. Mirrors user_blueprint_builds (0226):
-- per-user, named, UNIQUE per (user, weapon, name). config_json embeds a COPY of
-- the quality config (not a reference to a crafted build) so it stays stable if
-- the source crafted weapon is renamed/deleted.

CREATE TABLE IF NOT EXISTS user_weapon_builds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  weapon_uuid TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  config_json TEXT    NOT NULL,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_weapon_builds_user ON user_weapon_builds(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_weapon_builds_unique
  ON user_weapon_builds(user_id, weapon_uuid, name);
