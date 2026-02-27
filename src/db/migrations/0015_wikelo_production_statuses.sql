-- Set production_status_id for event-specific special edition ships that SC Wiki
-- tracks by name but doesn't provide a production_status field for.
-- All are limited-edition variants of flight-ready ships.
-- IDs: 1=flight_ready, 2=in_production, 3=in_concept, 4=unknown

UPDATE vehicles SET production_status_id = 1
WHERE slug IN (
  'a2-hercules-starlifter-wikelo-war-special', -- variant of A2 Hercules Starlifter
  'ares-star-fighter-inferno-wikelo-war-special', -- variant of Ares Inferno
  'ares-star-fighter-ion-wikelo-sneak-special',   -- variant of Ares Ion
  'f7-hornet-mk-wikelo',                          -- variant of F7 Hornet
  'hornet-f7a-mk-ii-pyam-exec'                    -- variant of F7A Mk II
)
AND production_status_id IS NULL;
