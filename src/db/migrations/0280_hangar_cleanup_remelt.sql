-- Hangar Cleanup: "buy and immediately remelt for buyback token".
--
-- 1. Buy list: a ship can be marked to be melted straight after purchase, so
--    it sits in Buy Back Pledges at the price paid.
--    NOTE: ALTER TABLE ... ADD COLUMN is NOT idempotent. Applied once by
--    wrangler; if ever re-run by hand, skip this statement when
--    pragma_table_info('user_hangar_cleanup_buys') already lists remelt.
ALTER TABLE user_hangar_cleanup_buys ADD COLUMN remelt INTEGER NOT NULL DEFAULT 0;

-- 2. Ledger: new decision 'iae-remelt' (melt, rebuy at IAE, remelt the new
--    pledge). SQLite cannot alter a CHECK constraint, so the table is rebuilt
--    with the wider list. Nothing references this table by foreign key, and it
--    has no indexes beyond the UNIQUE constraint. Row writes = the number of
--    saved decisions (one copy each).
CREATE TABLE user_hangar_cleanup_decisions_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rsi_pledge_id   INTEGER NOT NULL,
  decision        TEXT    CHECK (decision IN ('keep', 'melt', 'melt-ig', 'iae', 'iae-remelt', 'ins', 'review')),
  buy_ingame      INTEGER NOT NULL DEFAULT 0,
  iae_price_cents INTEGER,
  updated_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, rsi_pledge_id)
);

INSERT INTO user_hangar_cleanup_decisions_new (id, user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents, updated_at)
SELECT id, user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents, updated_at
FROM user_hangar_cleanup_decisions;

DROP TABLE user_hangar_cleanup_decisions;

ALTER TABLE user_hangar_cleanup_decisions_new RENAME TO user_hangar_cleanup_decisions;
