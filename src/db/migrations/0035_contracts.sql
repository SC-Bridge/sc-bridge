-- 0035_contracts.sql
-- Named NPC contract reference table (Wikelo/The Collector, Gilly's Flight School, Ruto)
CREATE TABLE IF NOT EXISTS contracts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_key     TEXT    NOT NULL UNIQUE,
  giver            TEXT    NOT NULL,
  giver_slug       TEXT    NOT NULL,
  category         TEXT    NOT NULL,
  sequence_num     INTEGER,
  title            TEXT    NOT NULL,
  description      TEXT,
  reward_text      TEXT,
  reward_amount    INTEGER DEFAULT 0,
  reward_currency  TEXT,
  is_dynamic_reward INTEGER DEFAULT 0,
  is_active        INTEGER DEFAULT 1,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS idx_contracts_giver_slug ON contracts(giver_slug);
CREATE INDEX IF NOT EXISTS idx_contracts_is_active  ON contracts(is_active);
