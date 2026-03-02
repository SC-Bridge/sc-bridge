-- 0042_vehicles_acquisition_source_name.sql
--
-- Add acquisition_source_name column to vehicles.
-- This column stores a human-readable source name for in-game acquisition types
-- (e.g. the specific mission, quest, or contract zone where the ship is obtained).
-- Referenced by the /api/ships route and ShipDB/ShipDetail frontend pages.

ALTER TABLE vehicles ADD COLUMN acquisition_source_name TEXT;
