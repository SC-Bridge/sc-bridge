-- Gadget-module sub-slots that live INSIDE a tool head (mining laser / salvage
-- head). Extracted from p4k: each head's SItemPortContainerComponentParams.Ports
-- whose RequiredPortTags is a gadget tag ('miningConsumable' / 'salvageMount').
-- The head itself is a swappable WeaponMining/SalvageHead component (already
-- handled by /compatible); THIS table models the consumable gadget slots a head
-- carries, so the loadout planner can offer a gadget per slot.
--
-- Keyed to the HEAD component (component_id → vehicle_components), NOT the ship —
-- slot count is a property of the head (a MOLE's 3 turret lasers each carry their
-- own slots). Version-keyed so it reloads cleanly per patch. Loaded out-of-band
-- from .local/head_slots.json (see .local/gen_module_slots_sql.py).
CREATE TABLE component_module_slots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id    INTEGER NOT NULL REFERENCES vehicle_components(id),
  slot_index      INTEGER NOT NULL,
  slot_name       TEXT    NOT NULL,
  min_size        INTEGER NOT NULL DEFAULT 1,
  max_size        INTEGER NOT NULL DEFAULT 1,
  accepts_tag     TEXT    NOT NULL,           -- RequiredPortTags: miningConsumable | salvageMount
  port_tags       TEXT,                       -- full PortTags (disambiguates ATLS/ROCds specialty slots)
  game_version_id INTEGER REFERENCES game_versions(id),
  data_source     TEXT,
  UNIQUE(component_id, slot_index)
);
CREATE INDEX idx_cms_component ON component_module_slots(component_id);
CREATE INDEX idx_cms_tag ON component_module_slots(accepts_tag);
