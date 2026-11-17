-- Multi-account support, phase 4: per-account Hangar Cleanup buys and state,
-- gift decisions, and the AI account scope.
--
--   user_hangar_cleanup_buys   rebuilt with rsi_account_id, UNIQUE(user_id, rsi_account_id, vehicle_id)
--   user_hangar_cleanup_state  rebuilt with rsi_account_id, UNIQUE(user_id, rsi_account_id)
--   user_hangar_cleanup_decisions
--                              rebuilt: CHECK gains 'gift', gains gift_to_account_id
--   ai_analyses, ai_chats      gain account_ids_json (NULL = all accounts, else a JSON array of ids)
--
-- Existing buys and state rows are stamped with the user's primary account. A
-- user with cleanup data but no account first gets a placeholder primary (same
-- shape as 0287 section 0), so nothing is dropped for lack of one.
-- No table references these three, so the DROPs cascade nowhere.
-- EXISTS ... OR rather than a UNION: D1 rejects a compound SELECT with more
-- than 5 terms.

-- 0. Placeholder primary account for users with cleanup data and no account.
INSERT INTO user_rsi_accounts (user_id, label, is_primary, is_placeholder, color)
SELECT u.id, 'Imported hangar', 1, 1, '#22d3ee'
FROM user u
WHERE u.id NOT IN (SELECT user_id FROM user_rsi_accounts)
  AND (
       EXISTS (SELECT 1 FROM user_hangar_cleanup_buys  t WHERE t.user_id = u.id)
    OR EXISTS (SELECT 1 FROM user_hangar_cleanup_state t WHERE t.user_id = u.id)
  );

-- 1. user_hangar_cleanup_buys
CREATE TABLE user_hangar_cleanup_buys_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_account_id INTEGER REFERENCES user_rsi_accounts(id),
  vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id),
  price_cents    INTEGER,
  created_at     TEXT    DEFAULT (datetime('now')),
  remelt         INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, rsi_account_id, vehicle_id)
);

INSERT OR IGNORE INTO user_hangar_cleanup_buys_new
  (user_id, rsi_account_id, vehicle_id, price_cents, created_at, remelt)
SELECT o.user_id, a.id, o.vehicle_id, o.price_cents, o.created_at, o.remelt
FROM user_hangar_cleanup_buys o
JOIN user_rsi_accounts a ON a.user_id = o.user_id AND a.is_primary = 1
ORDER BY o.id;

DROP TABLE user_hangar_cleanup_buys;
ALTER TABLE user_hangar_cleanup_buys_new RENAME TO user_hangar_cleanup_buys;

CREATE INDEX idx_user_hangar_cleanup_buys_vehicle_id ON user_hangar_cleanup_buys(vehicle_id);
CREATE INDEX idx_user_hangar_cleanup_buys_rsi_account ON user_hangar_cleanup_buys(rsi_account_id);

-- 2. user_hangar_cleanup_state
CREATE TABLE user_hangar_cleanup_state_new (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_account_id        INTEGER REFERENCES user_rsi_accounts(id),
  credit_override_cents INTEGER,
  done_steps_json       TEXT,
  updated_at            TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, rsi_account_id)
);

INSERT OR IGNORE INTO user_hangar_cleanup_state_new
  (user_id, rsi_account_id, credit_override_cents, done_steps_json, updated_at)
SELECT o.user_id, a.id, o.credit_override_cents, o.done_steps_json, o.updated_at
FROM user_hangar_cleanup_state o
JOIN user_rsi_accounts a ON a.user_id = o.user_id AND a.is_primary = 1
ORDER BY o.id;

DROP TABLE user_hangar_cleanup_state;
ALTER TABLE user_hangar_cleanup_state_new RENAME TO user_hangar_cleanup_state;

CREATE INDEX idx_user_hangar_cleanup_state_rsi_account ON user_hangar_cleanup_state(rsi_account_id);

-- 3. user_hangar_cleanup_decisions: 'gift' decision and its target account.
CREATE TABLE user_hangar_cleanup_decisions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_pledge_id       INTEGER NOT NULL,
  decision            TEXT    CHECK (decision IN ('keep', 'melt', 'melt-ig', 'iae', 'iae-remelt', 'ins', 'review', 'gift')),
  buy_ingame          INTEGER NOT NULL DEFAULT 0,
  iae_price_cents     INTEGER,
  updated_at          TEXT    DEFAULT (datetime('now')),
  gift_to_account_id  INTEGER REFERENCES user_rsi_accounts(id),
  UNIQUE(user_id, rsi_pledge_id)
);

INSERT INTO user_hangar_cleanup_decisions_new
  (id, user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents, updated_at)
SELECT id, user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents, updated_at
FROM user_hangar_cleanup_decisions
ORDER BY id;

DROP TABLE user_hangar_cleanup_decisions;
ALTER TABLE user_hangar_cleanup_decisions_new RENAME TO user_hangar_cleanup_decisions;

-- 4. AI account scope
ALTER TABLE ai_analyses ADD COLUMN account_ids_json TEXT;
ALTER TABLE ai_chats ADD COLUMN account_ids_json TEXT;
