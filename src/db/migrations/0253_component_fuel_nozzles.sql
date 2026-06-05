-- 0253_component_fuel_nozzles
--
-- Ship refuelling-nozzle deep stats. Giver nozzles (Norfield/Harkin/RN-7s/
-- Marlin/Lindstrom/Bendix/Torrez/Ezra) carry AttachDef.Type=DockingCollar +
-- SCItemFuelNozzleParams. The v2 extractor routes ONLY those into
-- vehicle_components (the ~150 structural ship dockingtubes have no nozzle
-- param and are skipped). Stats:
--   hydrogen_flow_rate / quantum_flow_rate  → ItemResourceComponentParams
--                                             consumption deltas (SCU/s)
--   max_integrity                            → SHealthComponentParams.Health
--                                             (also on base vehicle_components.hp;
--                                              duplicated here so the UI shows it
--                                              without leaking generic hp into
--                                              every component's stat panel)
-- Sub-table mirrors the migration 0189 component_* shape (no data_source col).

CREATE TABLE component_fuel_nozzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES vehicle_components(id) ON DELETE CASCADE,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  hydrogen_flow_rate REAL,
  quantum_flow_rate REAL,
  max_integrity REAL,
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT,
  UNIQUE(component_id)
);
CREATE INDEX idx_component_fuel_nozzles_cid ON component_fuel_nozzles(component_id);

-- PTU shadow (mirrors migration 0215 ptu_component_* shape).
CREATE TABLE IF NOT EXISTS ptu_component_fuel_nozzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES ptu_vehicle_components(id) ON DELETE CASCADE,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  hydrogen_flow_rate REAL,
  quantum_flow_rate REAL,
  max_integrity REAL,
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_in_patch TEXT,
  UNIQUE(component_id)
);
