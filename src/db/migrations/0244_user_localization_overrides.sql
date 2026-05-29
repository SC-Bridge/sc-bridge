-- Localization Builder: per-user ad-hoc single-key overrides ("My
-- Customizations"). Edited from the Key Browser; merged at the highest
-- priority (above community packs and generated personal labels) when
-- building the downloaded global.ini.
CREATE TABLE user_localization_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  loc_key     TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, loc_key)
);

CREATE INDEX idx_user_localization_overrides_user ON user_localization_overrides(user_id);
