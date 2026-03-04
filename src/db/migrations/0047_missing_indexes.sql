-- Add missing indexes on FK columns used in JOINs
-- SQLite/D1 does not auto-index FK columns

-- Core FK joins
CREATE INDEX IF NOT EXISTS idx_user_fleet_vehicle_id ON user_fleet(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_paint_vehicles_paint_id ON paint_vehicles(paint_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_manufacturer_id ON vehicles(manufacturer_id);

-- Loot map FK columns used in LOOT_CATEGORY_CASE and reverse lookups
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_weapon_id ON loot_map(fps_weapon_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_armour_id ON loot_map(fps_armour_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_helmet_id ON loot_map(fps_helmet_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_fps_clothing_id ON loot_map(fps_clothing_id);
CREATE INDEX IF NOT EXISTS idx_loot_map_vehicle_component_id ON loot_map(vehicle_component_id);
