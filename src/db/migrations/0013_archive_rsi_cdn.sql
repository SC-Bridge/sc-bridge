-- Archive RSI CDN URLs from vehicle_images into a separate table.
-- vehicle_images becomes the clean CF Images reference: vehicle_id + cf_images_id only.

CREATE TABLE vehicle_images_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  rsi_id INTEGER,
  rsi_slug TEXT,
  rsi_cdn_new TEXT,
  rsi_cdn_old TEXT,
  rsi_graphql TEXT,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicle_images_archive_vehicle_id ON vehicle_images_archive(vehicle_id);

INSERT INTO vehicle_images_archive (vehicle_id, rsi_id, rsi_slug, rsi_cdn_new, rsi_cdn_old, rsi_graphql)
SELECT vehicle_id, rsi_id, rsi_slug, rsi_cdn_new, rsi_cdn_old, rsi_graphql
FROM vehicle_images;

DROP INDEX IF EXISTS idx_vehicle_images_rsi_id;

ALTER TABLE vehicle_images DROP COLUMN rsi_id;
ALTER TABLE vehicle_images DROP COLUMN rsi_slug;
ALTER TABLE vehicle_images DROP COLUMN rsi_cdn_new;
ALTER TABLE vehicle_images DROP COLUMN rsi_cdn_old;
ALTER TABLE vehicle_images DROP COLUMN rsi_graphql;
