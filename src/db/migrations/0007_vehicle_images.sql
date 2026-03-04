-- Vehicle image source tracking
-- Stores known image URLs per vehicle from each RSI data source.
-- rsi_cdn_new is preferred (new /i/ format); rsi_cdn_old and rsi_graphql are fallbacks.
-- vehicles.parent_vehicle_id allows special editions to inherit the base ship's image.

CREATE TABLE IF NOT EXISTS ship_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  rsi_id INTEGER,
  rsi_slug TEXT,
  rsi_cdn_new TEXT,
  rsi_cdn_old TEXT,
  rsi_graphql TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_ship_images_vehicle_id ON ship_images(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ship_images_rsi_id ON ship_images(rsi_id);

ALTER TABLE vehicles ADD COLUMN parent_vehicle_id INTEGER REFERENCES vehicles(id);
