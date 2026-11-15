-- Multi-account support, phase 1: one SC Bridge sign-in can hold several
-- RSI (Star Citizen) accounts. This migration lays the schema and moves every
-- existing user's hangar onto exactly one account each.
--
-- 1. user_rsi_accounts — one row per RSI account a user has synced.
-- 2. Backfill: one primary account per user who has a user_rsi_profiles row
--    or any row in the hangar tables. From user_rsi_profiles when present;
--    otherwise a placeholder ('Imported hangar', no handle).
-- 3. rsi_account_id on user_fleet, user_pledges, user_pledge_items,
--    user_pledge_upgrades, user_buyback_pledges, user_hangar_syncs, stamped
--    with the user's account.
-- 4. user_paints rebuilt with rsi_account_id and UNIQUE(rsi_account_id,
--    paint_id) in place of UNIQUE(user_id, paint_id). No table references
--    user_paints, so the DROP cascades nowhere.
--
-- rsi_account_id has no ON DELETE action on purpose: deleting an account is
-- done explicitly in code, and the FK makes a stray delete fail loudly.
--
-- Known limit: user_pledges keeps UNIQUE(user_id, rsi_pledge_id). Rebuilding
-- it would cascade-delete user_pledge_items / user_pledge_upgrades. If one
-- RSI pledge id ever appears on two of a user's accounts, the later sync
-- moves that pledge to its account.
--
-- The fleet upsert index idx_user_fleet_user_pledge_vehicle is left as is.
--
-- NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. Applied once by
-- wrangler; if ever re-run by hand, skip each ADD COLUMN whose table already
-- lists rsi_account_id in pragma_table_info, and skip the backfill INSERT
-- when user_rsi_accounts already has rows.

-- 1. Accounts table
CREATE TABLE IF NOT EXISTS user_rsi_accounts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_handle           TEXT,
  referral_code        TEXT,
  label                TEXT,
  is_primary           INTEGER NOT NULL DEFAULT 0,
  is_placeholder       INTEGER NOT NULL DEFAULT 0,
  verified_at          TEXT,
  synced_at            TEXT,
  display_name         TEXT,
  avatar_url           TEXT,
  enlisted_since       TEXT,
  country              TEXT,
  concierge_level      TEXT,
  subscriber_type      TEXT,
  subscriber_frequency TEXT,
  store_credit_cents   INTEGER,
  uec_balance          INTEGER,
  rec_balance          INTEGER,
  has_game_package     INTEGER DEFAULT 0,
  orgs_json            TEXT,
  badges_json          TEXT,
  featured_badges_json TEXT,
  created_at           TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_rsi_accounts_user ON user_rsi_accounts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rsi_accounts_primary
  ON user_rsi_accounts(user_id) WHERE is_primary = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rsi_accounts_referral
  ON user_rsi_accounts(user_id, referral_code) WHERE referral_code IS NOT NULL;

-- 2a. Backfill from user_rsi_profiles (real accounts)
INSERT INTO user_rsi_accounts (
  user_id, rsi_handle, referral_code, label, is_primary, is_placeholder,
  verified_at, synced_at, display_name, avatar_url, enlisted_since, country,
  concierge_level, subscriber_type, subscriber_frequency, store_credit_cents,
  uec_balance, rec_balance, has_game_package, orgs_json, badges_json,
  featured_badges_json
)
SELECT
  p.user_id, p.rsi_handle, p.referral_code, NULL, 1, 0,
  COALESCE(rp.verified_at, p.synced_at), p.synced_at, p.rsi_displayname,
  p.avatar_url, p.enlisted_since, p.country, p.concierge_level,
  p.subscriber_type, p.subscriber_frequency, p.store_credit_cents,
  p.uec_balance, p.rec_balance, p.has_game_package, p.orgs_json,
  p.badges_json, p.featured_badges_json
FROM user_rsi_profiles p
LEFT JOIN user_rsi_profile rp ON rp.user_id = p.user_id
WHERE p.user_id IN (SELECT id FROM user);

-- 2b. Placeholder accounts for users with hangar rows but no profile
INSERT INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder)
SELECT u.user_id, 'Imported hangar', 1, 1
FROM (
  SELECT user_id FROM user_fleet
  UNION SELECT user_id FROM user_pledges
  UNION SELECT user_id FROM user_pledge_items
  UNION SELECT user_id FROM user_pledge_upgrades
  UNION SELECT user_id FROM user_buyback_pledges
  UNION SELECT user_id FROM user_hangar_syncs
  UNION SELECT user_id FROM user_paints
) u
WHERE u.user_id IN (SELECT id FROM user)
  AND u.user_id NOT IN (SELECT user_id FROM user_rsi_accounts);

-- 3a. Account column on the hangar tables
ALTER TABLE user_fleet           ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);
ALTER TABLE user_pledges         ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);
ALTER TABLE user_pledge_items    ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);
ALTER TABLE user_pledge_upgrades ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);
ALTER TABLE user_buyback_pledges ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);
ALTER TABLE user_hangar_syncs    ADD COLUMN rsi_account_id INTEGER REFERENCES user_rsi_accounts(id);

-- 3b. Stamp existing rows with the user's (single, primary) account
UPDATE user_fleet           SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_fleet.user_id);
UPDATE user_pledges         SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_pledges.user_id);
UPDATE user_pledge_items    SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_pledge_items.user_id);
UPDATE user_pledge_upgrades SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_pledge_upgrades.user_id);
UPDATE user_buyback_pledges SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_buyback_pledges.user_id);
UPDATE user_hangar_syncs    SET rsi_account_id = (SELECT id FROM user_rsi_accounts a WHERE a.user_id = user_hangar_syncs.user_id);

-- 3c. Indexes on the new columns
CREATE INDEX IF NOT EXISTS idx_user_fleet_rsi_account           ON user_fleet(rsi_account_id);
CREATE INDEX IF NOT EXISTS idx_user_pledges_rsi_account         ON user_pledges(rsi_account_id);
CREATE INDEX IF NOT EXISTS idx_user_pledge_items_rsi_account    ON user_pledge_items(rsi_account_id);
CREATE INDEX IF NOT EXISTS idx_user_pledge_upgrades_rsi_account ON user_pledge_upgrades(rsi_account_id);
CREATE INDEX IF NOT EXISTS idx_user_buyback_pledges_rsi_account ON user_buyback_pledges(rsi_account_id);
CREATE INDEX IF NOT EXISTS idx_user_hangar_syncs_rsi_account    ON user_hangar_syncs(rsi_account_id);

-- 4. user_paints rebuild (UNIQUE changes from per-user to per-account)
CREATE TABLE user_paints_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    rsi_account_id INTEGER REFERENCES user_rsi_accounts(id),
    paint_id       INTEGER NOT NULL REFERENCES paints(id),
    pledge_id      TEXT,
    pledge_name    TEXT,
    is_buyback     INTEGER NOT NULL DEFAULT 0,
    synced_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(rsi_account_id, paint_id)
);

INSERT INTO user_paints_new (id, user_id, rsi_account_id, paint_id, pledge_id, pledge_name, is_buyback, synced_at)
SELECT p.id, p.user_id,
       (SELECT a.id FROM user_rsi_accounts a WHERE a.user_id = p.user_id),
       p.paint_id, p.pledge_id, p.pledge_name, p.is_buyback, p.synced_at
FROM user_paints p;

DROP TABLE user_paints;

ALTER TABLE user_paints_new RENAME TO user_paints;

CREATE INDEX IF NOT EXISTS idx_user_paints_user        ON user_paints(user_id);
CREATE INDEX IF NOT EXISTS idx_user_paints_rsi_account ON user_paints(rsi_account_id);
