-- Performance indexes for vehicle_ports queries.
-- vehicle_id: used in every loadout query to filter by ship.
-- parent_port_id: used in the weapon-mount fallback subquery to look up child ports.

CREATE INDEX IF NOT EXISTS idx_vehicle_ports_vehicle_id ON vehicle_ports(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ports_parent_port_id ON vehicle_ports(parent_port_id);
