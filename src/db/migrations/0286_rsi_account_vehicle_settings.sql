-- Multi-account support, phase 3: per-account vehicle settings. Loaner
-- loadouts, module selections and the localization ship order move from
-- "one per user" to "one per RSI account".
--
-- Each table is rebuilt with rsi_account_id and a UNIQUE key that includes it.
-- No table references these three, so the DROPs cascade nowhere.
--
-- How existing rows are stamped:
--   user_module_selection, owner_kind = 'fleet'
--       the rsi_account_id of the user_fleet row named by owner_id.
--   user_loaner_loadout, and user_module_selection with owner_kind = 'loaner'
--       copied once per account of the user that is entitled to the loaner:
--       the account holds a non-loaner user_fleet row whose vehicle is not
--       flight_ready and grants that loaner through vehicle_loaners. When no
--       account is entitled the row goes to the user's primary account.
--   user_localization_ship_order
--       the user's primary account.
-- Rows with no resolvable account (a fleet selection whose ship is gone or
-- unstamped, a user with no accounts) are left out of the copy.
-- INSERT OR IGNORE lets duplicates collapse.
--
-- EXISTS ... OR rather than a UNION of cases: D1 rejects a compound SELECT
-- with more than 5 terms.

-- 1. user_loaner_loadout
CREATE TABLE user_loaner_loadout_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT    NOT NULL,
  rsi_account_id     INTEGER REFERENCES user_rsi_accounts(id),
  loaner_vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id),
  port_id            INTEGER NOT NULL REFERENCES vehicle_ports(id),
  component_id       INTEGER NOT NULL REFERENCES vehicle_components(id),
  created_at         TEXT    DEFAULT (datetime('now')),
  updated_at         TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, rsi_account_id, loaner_vehicle_id, port_id)
);

INSERT OR IGNORE INTO user_loaner_loadout_new
  (user_id, rsi_account_id, loaner_vehicle_id, port_id, component_id, created_at, updated_at)
SELECT o.user_id, a.id, o.loaner_vehicle_id, o.port_id, o.component_id, o.created_at, o.updated_at
FROM user_loaner_loadout o
JOIN user_rsi_accounts a ON a.user_id = o.user_id
WHERE EXISTS (
        SELECT 1 FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        JOIN production_statuses ps ON ps.id = v.production_status_id
        JOIN vehicle_loaners vl ON vl.vehicle_id = v.id
        WHERE uf.user_id = o.user_id AND uf.rsi_account_id = a.id AND uf.is_loaner = 0
          AND ps.key != 'flight_ready' AND vl.loaner_id = o.loaner_vehicle_id)
   OR (a.is_primary = 1 AND NOT EXISTS (
        SELECT 1 FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        JOIN production_statuses ps ON ps.id = v.production_status_id
        JOIN vehicle_loaners vl ON vl.vehicle_id = v.id
        WHERE uf.user_id = o.user_id AND uf.is_loaner = 0
          AND ps.key != 'flight_ready' AND vl.loaner_id = o.loaner_vehicle_id))
ORDER BY o.id;

DROP TABLE user_loaner_loadout;
ALTER TABLE user_loaner_loadout_new RENAME TO user_loaner_loadout;

CREATE INDEX idx_ull_user ON user_loaner_loadout(user_id);
CREATE INDEX idx_ull_vehicle ON user_loaner_loadout(loaner_vehicle_id);
CREATE INDEX idx_user_loaner_loadout_rsi_account ON user_loaner_loadout(rsi_account_id);

-- 2. user_module_selection
CREATE TABLE user_module_selection_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL,
  rsi_account_id INTEGER REFERENCES user_rsi_accounts(id),
  owner_kind     TEXT    NOT NULL CHECK (owner_kind IN ('fleet', 'loaner')),
  owner_id       INTEGER NOT NULL,
  port_name      TEXT    NOT NULL,
  module_uuid    TEXT    NOT NULL,
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now')),
  module_kind    TEXT    NOT NULL DEFAULT 'bay',
  UNIQUE(user_id, rsi_account_id, owner_kind, owner_id, port_name)
);

INSERT OR IGNORE INTO user_module_selection_new
  (user_id, rsi_account_id, owner_kind, owner_id, port_name, module_uuid, created_at, updated_at, module_kind)
SELECT o.user_id, uf.rsi_account_id, o.owner_kind, o.owner_id, o.port_name, o.module_uuid,
       o.created_at, o.updated_at, o.module_kind
FROM user_module_selection o
JOIN user_fleet uf ON uf.id = o.owner_id AND uf.user_id = o.user_id
WHERE o.owner_kind = 'fleet' AND uf.rsi_account_id IS NOT NULL
ORDER BY o.id;

INSERT OR IGNORE INTO user_module_selection_new
  (user_id, rsi_account_id, owner_kind, owner_id, port_name, module_uuid, created_at, updated_at, module_kind)
SELECT o.user_id, a.id, o.owner_kind, o.owner_id, o.port_name, o.module_uuid,
       o.created_at, o.updated_at, o.module_kind
FROM user_module_selection o
JOIN user_rsi_accounts a ON a.user_id = o.user_id
WHERE o.owner_kind = 'loaner'
  AND (EXISTS (
        SELECT 1 FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        JOIN production_statuses ps ON ps.id = v.production_status_id
        JOIN vehicle_loaners vl ON vl.vehicle_id = v.id
        WHERE uf.user_id = o.user_id AND uf.rsi_account_id = a.id AND uf.is_loaner = 0
          AND ps.key != 'flight_ready' AND vl.loaner_id = o.owner_id)
   OR (a.is_primary = 1 AND NOT EXISTS (
        SELECT 1 FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        JOIN production_statuses ps ON ps.id = v.production_status_id
        JOIN vehicle_loaners vl ON vl.vehicle_id = v.id
        WHERE uf.user_id = o.user_id AND uf.is_loaner = 0
          AND ps.key != 'flight_ready' AND vl.loaner_id = o.owner_id)))
ORDER BY o.id;

DROP TABLE user_module_selection;
ALTER TABLE user_module_selection_new RENAME TO user_module_selection;

CREATE INDEX idx_ums_user ON user_module_selection(user_id);
CREATE INDEX idx_ums_owner ON user_module_selection(owner_kind, owner_id);
CREATE INDEX idx_ums_kind ON user_module_selection(owner_kind, owner_id, module_kind);
CREATE INDEX idx_user_module_selection_rsi_account ON user_module_selection(rsi_account_id);

-- 3. user_localization_ship_order
CREATE TABLE user_localization_ship_order_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL,
  rsi_account_id  INTEGER REFERENCES user_rsi_accounts(id),
  vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id),
  sort_position   INTEGER NOT NULL,
  custom_label    TEXT,
  UNIQUE(user_id, rsi_account_id, vehicle_id),
  UNIQUE(user_id, rsi_account_id, sort_position)
);

INSERT OR IGNORE INTO user_localization_ship_order_new
  (user_id, rsi_account_id, vehicle_id, sort_position, custom_label)
SELECT o.user_id, a.id, o.vehicle_id, o.sort_position, o.custom_label
FROM user_localization_ship_order o
JOIN user_rsi_accounts a ON a.user_id = o.user_id AND a.is_primary = 1
ORDER BY o.id;

DROP TABLE user_localization_ship_order;
ALTER TABLE user_localization_ship_order_new RENAME TO user_localization_ship_order;

CREATE INDEX idx_user_localization_ship_order_user ON user_localization_ship_order(user_id);
CREATE INDEX idx_user_localization_ship_order_rsi_account ON user_localization_ship_order(rsi_account_id);
