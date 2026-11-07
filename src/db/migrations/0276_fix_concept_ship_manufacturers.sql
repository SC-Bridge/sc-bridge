-- Five concept ships (no uuid: not in the game files, so extraction never
-- touches them) were seeded with the wrong manufacturer in 0010_rsi_backfill
-- and the concept-ships staging script:
--   Vulcan       Musashi (MISC) → Aegis Dynamics
--   Pioneer      Musashi (MISC) → Consolidated Outland
--   Arrastra     Argo           → Roberts Space Industries
--   Expanse      Drake          → Musashi (MISC)
--   Legionnaire  Drake          → Anvil Aerospace
-- Pioneer and Arrastra are confirmed by RSI's own hangar data; all five match Fleetyards.
--
-- Manufacturer codes repeat across historical rows, so take the id from a
-- game-file ship of the same maker that already displays correctly. COALESCE
-- keeps the current value if the reference ship is ever missing.

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'aegs_idris_p' LIMIT 1), manufacturer_id)
WHERE slug = 'vulcan' AND uuid IS NULL;

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'cnou_nomad' LIMIT 1), manufacturer_id)
WHERE slug = 'pioneer' AND uuid IS NULL;

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'rsi_polaris' LIMIT 1), manufacturer_id)
WHERE slug = 'arrastra' AND uuid IS NULL;

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'misc_hull_c' LIMIT 1), manufacturer_id)
WHERE slug = 'expanse' AND uuid IS NULL;

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'anvl_carrack' LIMIT 1), manufacturer_id)
WHERE slug = 'legionnaire' AND uuid IS NULL;
