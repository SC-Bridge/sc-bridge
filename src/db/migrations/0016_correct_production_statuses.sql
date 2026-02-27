-- Correct production statuses using authoritative SC 4.6.0-live DataCore evidence.
-- Logic:
--   flight_ready (1) = ship entity exists in DataCore entities/spaceships or entities/groundvehicles
--   in_production (2) = no entity file, but ship has 3D model assets (holoviewer, materials, tint palettes)
--   in_concept (3)   = zero presence anywhere in 4.6.0 game data
--
-- Migration 0014 wrongly classified 14 ships as flight_ready.
-- Migration 0014 also wrongly classified 7 ships as in_production — they are actually in_concept.
-- Status IDs: 1=flight_ready, 2=in_production, 3=in_concept, 4=unknown

-- Fix 1: 13 ships marked flight_ready → in_production
-- These ships have 3D model assets in the game data (holoviewer materials, DataCore tint palettes)
-- but NO entity files — they are not flyable in 4.6.0-live.
UPDATE vehicles SET production_status_id = 2
WHERE slug IN (
  'e1-spirit',              -- Spirit E1: has tint palette + paint in DataCore; A1/C1 are in game but not E1
  'g12',                    -- Origin G12: has holoviewer model (orig_g12a_holo_viewer.mtl)
  'g12a',                   -- Origin G12a: same holoviewer asset
  'g12r',                   -- Origin G12r: same G12 family
  'kraken',                 -- Drake Kraken: has ship materials + thruster FX in Extracted
  'kraken-privateer',       -- Drake Kraken Privateer: same ship assets as Kraken
  'liberator',              -- Anvil Liberator: has holoviewer (anvl_liberator_holo_viewer.mtl)
  'nautilus',               -- Aegis Nautilus: has holoviewer (AEGS_Nautilus_holo_viewer.mtl)
  'nautilus-solstice-edition', -- Aegis Nautilus Solstice Edition: same as Nautilus
  'ranger-cv',              -- Tumbril Ranger CV: has holoviewer (TMBL_Ranger_holo_viewer.mtl)
  'ranger-rc',              -- Tumbril Ranger RC: same holoviewer asset
  'ranger-tr',              -- Tumbril Ranger TR: same holoviewer asset
  'zeus-mk-ii-mr'           -- Origin Zeus Mk II MR: base Zeus assets exist; CL/ES are in game, MR is not
)
AND production_status_id = 1;  -- only correct the ones set by migration 0014

-- Fix 2: 1 ship marked flight_ready → in_concept
-- Railen has ZERO presence anywhere in the 4.6.0 game data (no entity, no holoviewer, no assets)
UPDATE vehicles SET production_status_id = 3
WHERE slug = 'railen'
AND production_status_id = 1;

-- Fix 3: 7 ships marked in_production → in_concept
-- These have ZERO presence anywhere in the 4.6.0 game data
UPDATE vehicles SET production_status_id = 3
WHERE slug IN (
  'arrastra',         -- Argo Arrastra: zero game data
  'expanse',          -- Drake Expanse: zero game data
  'hull-b',           -- MISC Hull B: Hull A/C are in game; B/D/E have no assets
  'hull-d',           -- MISC Hull D: zero game data
  'hull-e',           -- MISC Hull E: zero game data
  'ironclad',         -- Crusader Ironclad: zero game data
  'ironclad-assault'  -- Crusader Ironclad Assault: zero game data
)
AND production_status_id = 2;  -- only correct the ones set by migration 0014
