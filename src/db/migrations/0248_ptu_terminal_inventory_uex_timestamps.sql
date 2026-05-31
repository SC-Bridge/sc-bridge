-- 0248_ptu_terminal_inventory_uex_timestamps.sql
--
-- Mirror migration 0247 onto the PTU shadow table. ptu_terminal_inventory
-- needs the same uex_date_modified + uex_date_added columns so that
-- getLootByUuid (and any other code that uses `t("terminal_inventory")`
-- with isPTU=true) selects through the same schema.
--
-- The shadow table can be in any of three states across our envs:
--   * test env  — exists with the 0215 schema (no new cols)
--   * staging   — was DROPped at some point during a 4.8 LIVE transition
--                 (only ptu_vehicle_storage of the original shadows remains)
--   * prod      — never had material PTU data; table either missing or empty
--
-- ALTER TABLE has no IF EXISTS in SQLite, so a bare ALTER would error on
-- staging/prod. Pattern from 0220_fix_ptu_game_versions_fk.sql: DROP + full
-- CREATE TABLE IF NOT EXISTS. Shadow data is bootstrap-from-LIVE; any rows
-- lost here will be rebuilt on the next PTU load (cf. 0215 / PTU shadow plan).
--
-- After 0248, the ptu_terminal_inventory schema mirrors terminal_inventory
-- + the two new UEX timestamp columns from 0247.

DROP TABLE IF EXISTS ptu_terminal_inventory;

CREATE TABLE IF NOT EXISTS ptu_terminal_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal_id INTEGER NOT NULL REFERENCES ptu_terminals(id),
  item_uuid TEXT NOT NULL,
  item_type TEXT,
  item_name TEXT,
  base_buy_price REAL,
  base_sell_price REAL,
  latest_buy_price REAL,
  latest_sell_price REAL,
  latest_source TEXT,
  latest_observed_at TEXT,
  base_inventory REAL,
  max_inventory REAL,
  game_version_id INTEGER REFERENCES game_versions(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT,
  uex_date_modified INTEGER,
  uex_date_added INTEGER,
  UNIQUE(terminal_id, item_uuid)
);

CREATE INDEX IF NOT EXISTS ptu_idx_terminal_inventory_item
  ON ptu_terminal_inventory(item_uuid);
CREATE INDEX IF NOT EXISTS ptu_idx_terminal_inventory_terminal
  ON ptu_terminal_inventory(terminal_id);
CREATE INDEX IF NOT EXISTS ptu_idx_terminal_inventory_uex_modified
  ON ptu_terminal_inventory(uex_date_modified)
  WHERE uex_date_modified IS NOT NULL;
