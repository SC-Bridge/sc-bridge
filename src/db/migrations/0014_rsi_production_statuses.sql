-- Set production_status_id for the 37 RSI-only ships added in migration 0010.
-- These ships are not tracked by SC Wiki (our primary source), so their status
-- must be set manually.
--
-- SC Wiki sync will override these values if it ever starts documenting these ships.
-- Status IDs: 1=flight_ready, 2=in_production, 3=in_concept, 4=unknown
--
-- Flight-ready: ships or variants confirmed flyable in-game.
-- In-production: pledged ships under active development, not yet in-game.

-- Flight Ready — variants of in-game ships (special editions, loadout bundles)
UPDATE vehicles SET production_status_id = 1
WHERE slug IN (
  'carrack-w-c8x',                          -- Carrack is in game; C8X is a loadout bundle
  'carrack-expedition-w-c8x',               -- same
  'caterpillar-2949-best-in-show-edition',  -- Caterpillar is in game
  'cutlass-black-2949-best-in-show-edition',-- Cutlass Black is in game
  'mustang-alpha-vindicator',               -- Mustang Alpha is in game
  'valkyrie-liberator-edition'              -- Valkyrie is in game
)
AND production_status_id IS NULL;

-- Flight Ready — standalone vehicles/ships confirmed in-game
UPDATE vehicles SET production_status_id = 1
WHERE slug IN (
  'e1-spirit',      -- Crusader Spirit series is in game
  'g12',            -- Origin ground vehicle, in game
  'g12a',           -- in game
  'g12r',           -- in game
  'kraken',         -- Drake capital carrier, in game
  'kraken-privateer',-- variant, in game
  'liberator',      -- Anvil carrier, in game
  'nautilus',       -- Aegis mine layer, in game
  'nautilus-solstice-edition', -- variant, in game
  'railen',         -- Gatac fighter, in game
  'ranger-cv',      -- Tumbril bike, in game
  'ranger-rc',      -- in game
  'ranger-tr',      -- in game
  'zeus-mk-ii-mr'   -- Origin multi-role fighter, in game
)
AND production_status_id IS NULL;

-- In Production — pledged ships actively under development, not yet in-game
UPDATE vehicles SET production_status_id = 2
WHERE slug IN (
  'arrastra',        -- Argo heavy mining ship
  'crucible',        -- Anvil repair ship (long in development)
  'endeavor',        -- MISC research vessel
  'expanse',         -- Drake exploration ship
  'galaxy',          -- RSI modular ship
  'genesis',         -- Crusader starliner
  'hull-b',          -- MISC Hull series (A and C are in game, B/D/E are not)
  'hull-d',
  'hull-e',
  'ironclad',        -- Crusader armoured transport
  'ironclad-assault',-- variant
  'legionnaire',     -- Drake boarding ship
  'merchantman',     -- Banu super-freighter (famously delayed)
  'odyssey',         -- MISC long-haul explorer
  'orion',           -- RSI mining platform
  'pioneer',         -- MISC base-building ship
  'vulcan'           -- MISC support (repair/refuel/rearm)
)
AND production_status_id IS NULL;
