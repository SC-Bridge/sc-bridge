-- Rename ship_images to vehicle_images to align with vehicles table naming convention
ALTER TABLE ship_images RENAME TO vehicle_images;

DROP INDEX IF EXISTS idx_ship_images_vehicle_id;
DROP INDEX IF EXISTS idx_ship_images_rsi_id;

CREATE INDEX IF NOT EXISTS idx_vehicle_images_vehicle_id ON vehicle_images(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_images_rsi_id ON vehicle_images(rsi_id);
