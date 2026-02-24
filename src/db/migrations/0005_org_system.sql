-- Migration 0005: Organisation system
-- Adds user RSI profile cache and org-visibility fields to user_fleet.
-- NOTE: organization, member, and invitation tables are managed by Better Auth
--       and will be auto-created via POST /api/auth/migrate after the
--       organization() plugin is added to auth.ts.

-- RSI citizen profile cache (keyed by Better Auth user.id)
CREATE TABLE IF NOT EXISTS user_rsi_profile (
  user_id       TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  handle        TEXT NOT NULL,
  display_name  TEXT,
  citizen_record TEXT,
  enlisted_at   TEXT,
  avatar_url    TEXT,
  main_org_slug TEXT,
  orgs_json     TEXT,   -- JSON: [{slug, name, is_main}]
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fleet visibility and operational availability per ship
ALTER TABLE user_fleet ADD COLUMN org_visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE user_fleet ADD COLUMN available_for_ops INTEGER NOT NULL DEFAULT 0;
-- org_visibility values: 'public' | 'org' | 'officers' | 'private'
