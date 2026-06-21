-- Loaner loadout customization.
-- Loaners are DERIVED rows (no user_fleet entry), so their custom component
-- choices can't hang off user_fleet_loadout (keyed by user_fleet_id). This
-- mirrors user_fleet_loadout but keys by the loaner's vehicle_id instead — a
-- separate, additive table so fleet value / import-swap / public fleet / the
-- GDPR cascade are all untouched. Only stores overrides; absent ports use stock.
CREATE TABLE user_loaner_loadout (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT    NOT NULL,
  loaner_vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id),
  port_id            INTEGER NOT NULL REFERENCES vehicle_ports(id),
  component_id       INTEGER NOT NULL REFERENCES vehicle_components(id),
  created_at         TEXT    DEFAULT (datetime('now')),
  updated_at         TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, loaner_vehicle_id, port_id)
);
CREATE INDEX idx_ull_user ON user_loaner_loadout(user_id);
CREATE INDEX idx_ull_vehicle ON user_loaner_loadout(loaner_vehicle_id);
