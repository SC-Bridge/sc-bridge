-- Mark vehicles that are cosmetic paint editions rather than distinct ships.
-- These remain in the vehicles table so hangar imports can still match them,
-- but they are excluded from the ShipDB browser.
ALTER TABLE vehicles ADD COLUMN is_paint_variant INTEGER NOT NULL DEFAULT 0;
