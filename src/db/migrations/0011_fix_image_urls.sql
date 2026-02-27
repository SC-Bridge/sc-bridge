-- Fix vehicles whose image_url was overwritten with SC Wiki relative paths.
-- Restore from vehicle_images.rsi_cdn_new (the authoritative RSI CloudFront URL).
UPDATE vehicles
SET
  image_url        = (SELECT rsi_cdn_new FROM vehicle_images WHERE vehicle_id = vehicles.id),
  image_url_small  = (SELECT rsi_cdn_new FROM vehicle_images WHERE vehicle_id = vehicles.id),
  image_url_medium = (SELECT rsi_cdn_new FROM vehicle_images WHERE vehicle_id = vehicles.id),
  image_url_large  = (SELECT rsi_cdn_new FROM vehicle_images WHERE vehicle_id = vehicles.id)
WHERE image_url NOT LIKE 'http%'
  AND image_url IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM vehicle_images
    WHERE vehicle_id = vehicles.id AND rsi_cdn_new IS NOT NULL
  );

-- Create vehicle_images rows for all vehicles that currently lack one
-- and have an absolute old-CDN URL in vehicles.image_url (store_large format).
-- rsi_cdn_old  = store_large URL (the image_url field from migration 0010)
-- rsi_graphql  = product_thumb_medium_and_small URL (derived from store_large)
INSERT OR IGNORE INTO vehicle_images (vehicle_id, rsi_cdn_old, rsi_graphql)
SELECT
  v.id,
  v.image_url,
  REPLACE(
    REPLACE(v.image_url, '/store_large.jpg', '/product_thumb_medium_and_small.jpg'),
    '/store_large.png',
    '/product_thumb_medium_and_small.png'
  )
FROM vehicles v
LEFT JOIN vehicle_images vi ON vi.vehicle_id = v.id
WHERE vi.id IS NULL
  AND v.image_url LIKE 'https://media.robertsspaceindustries.com/%';
