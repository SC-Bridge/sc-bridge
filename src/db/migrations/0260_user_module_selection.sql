-- User's chosen bay/room module per ship slot (Plan 5).
-- Polymorphic owner so the SAME table serves owned fleet ships AND derived
-- loaners (which have no user_fleet row): owner_kind = 'fleet' → owner_id is a
-- user_fleet.id; owner_kind = 'loaner' → owner_id is a vehicles.id. Only stores
-- non-default choices; an absent slot means the ship's stock (is_default) module.
-- Keyed by port_name (the module slot, e.g. hardpoint_front_module). No FK to
-- user_fleet (polymorphic owner) → account deletion clears it explicitly.
CREATE TABLE user_module_selection (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  owner_kind  TEXT    NOT NULL CHECK (owner_kind IN ('fleet', 'loaner')),
  owner_id    INTEGER NOT NULL,
  port_name   TEXT    NOT NULL,
  module_uuid TEXT    NOT NULL,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(user_id, owner_kind, owner_id, port_name)
);
CREATE INDEX idx_ums_user ON user_module_selection(user_id);
CREATE INDEX idx_ums_owner ON user_module_selection(owner_kind, owner_id);
