-- "Standard" paints: one synthetic row per hull for the look it ships with.
--
-- In the game, a hull's stock look is the bare model. No paint item exists
-- for it, except on about 19 special editions (e.g. the Caterpillar Pirate
-- ships in the Pirate livery). The tools pipeline now emits a synthetic
-- paint per remaining hull: class_name standard_<vehicle class_name>, no
-- image, linked only to its own hull with paint_vehicles.is_default_for_vehicle = 1.
-- That gives every ship exactly one default paint.
--
-- is_standard = 1 marks those rows. They are not items anyone can buy or loot,
-- so they stay out of the paint browser, paint counts, /paints/:slug, and
-- pledge-title matching. The ship page and the Loadout picker show them.
--
-- The partial index serves the per-ship "what is this hull's default paint"
-- lookup on the fleet read. The table's PK starts with paint_id, so a lookup
-- by vehicle_id would otherwise scan every link for each ship.
ALTER TABLE paints ADD COLUMN is_standard INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_paint_vehicles_default
  ON paint_vehicles(vehicle_id) WHERE is_default_for_vehicle = 1;
