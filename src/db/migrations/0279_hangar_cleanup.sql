-- Hangar Cleanup page (staging-only feature) — schema + store-credit data fix.
--
-- 1. user_pledges gains the per-pledge fields the page analyses. The extension
--    has always sent isWarbond and upgradeData per pledge; the import dropped
--    them (warbond lived only on user_fleet, CCU from/to was never stored).
--    ccu_from_name / ccu_to_name = first upgradeData.match_items[].name and
--    first non-insurance/paint/schematic target_items[].name; NULL for non-CCU.
--    NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. This is a normal
--    numbered migration applied once by wrangler; if it ever has to be re-run
--    by hand (`d1 execute --file`), skip these three statements when the
--    columns already exist (check pragma_table_info('user_pledges')).
ALTER TABLE user_pledges ADD COLUMN is_warbond INTEGER DEFAULT 0;
ALTER TABLE user_pledges ADD COLUMN ccu_from_name TEXT;
ALTER TABLE user_pledges ADD COLUMN ccu_to_name TEXT;

-- 2. The user's saved cleanup decisions, keyed by RSI pledge id (stable across
--    re-syncs, unlike user_pledges.id). decision is NULL when only buy_ingame /
--    iae_price_cents is set; the API deletes the row when all three are empty.
CREATE TABLE IF NOT EXISTS user_hangar_cleanup_decisions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_pledge_id   INTEGER NOT NULL,
  decision        TEXT    CHECK (decision IN ('keep', 'melt', 'melt-ig', 'iae', 'ins', 'review')),
  buy_ingame      INTEGER NOT NULL DEFAULT 0,
  iae_price_cents INTEGER,
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, rsi_pledge_id)
);

-- Ships the user plans to buy (IAE shopping list). price_cents NULL = use the
-- store price (vehicles.pledge_price).
CREATE TABLE IF NOT EXISTS user_hangar_cleanup_buys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id),
  price_cents INTEGER,
  created_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hangar_cleanup_buys_vehicle_id ON user_hangar_cleanup_buys(vehicle_id);

-- One row per user: store-credit override and completed checklist steps.
CREATE TABLE IF NOT EXISTS user_hangar_cleanup_state (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               TEXT    NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  credit_override_cents INTEGER,
  done_steps_json       TEXT,
  updated_at            TEXT    DEFAULT (datetime('now'))
);

-- 3. Store-credit fix. Extension versions < 0.6.2 multiplied RSI's
--    store_credit_cents by 100 ($77.95 stored as 779500). 0.6.2 (the fix) did
--    not exist before 2026-11-07 20:00 UTC, so every value synced before then
--    is x100 too large. The import now corrects old-extension payloads itself,
--    so rows synced after the cutoff are already right in either case.
--    user_rsi_profiles.synced_at is written ONLY by datetime('now') (the
--    hangar-sync upsert + the column DEFAULT), i.e. UTC in SQLite's
--    'YYYY-MM-DD HH:MM:SS' format with a SPACE, not ISO 'T'. The literal must
--    use the same format: with a 'T' literal, every 2026-11-07 row would sort
--    before it (' ' < 'T') and post-cutoff rows that day would be divided too.
--    Integer division is exact for x100 values; the % 100 guard skips any
--    value that cannot be a x100 value rather than truncating it.
UPDATE user_rsi_profiles
SET store_credit_cents = store_credit_cents / 100
WHERE store_credit_cents IS NOT NULL
  AND store_credit_cents % 100 = 0
  AND synced_at < '2026-11-07 20:00:00';
