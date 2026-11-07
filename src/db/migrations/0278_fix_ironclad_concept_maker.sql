-- Same bug as 0276: two old concept rows (uuid NULL, removed = 1) for the
-- Ironclad and Ironclad Assault were seeded with Crusader Industries. Both are
-- Drake ships (Fleetyards agrees, and the game-file rows drak_ironclad /
-- drak_ironclad_assault already say Drake). They are hidden from /api/ships,
-- but anything still pointing at them would show the wrong maker.
--
-- Take Drake's manufacturer_id from the game-file Ironclad (ids differ between
-- staging and prod, so look it up by class_name). COALESCE keeps the current
-- value if that ship is ever missing.

UPDATE vehicles
SET manufacturer_id = COALESCE((SELECT manufacturer_id FROM vehicles WHERE class_name = 'drak_ironclad' LIMIT 1), manufacturer_id)
WHERE slug IN ('ironclad', 'ironclad-assault') AND uuid IS NULL;
