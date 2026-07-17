-- Clean NULL-vehicle residue from vehicle_suit_lockers / vehicle_weapon_racks.
--
-- Both tables upsert with vehicle_id resolved by subquery; lockers/racks whose
-- vehicle is unresolvable at insert time land with vehicle_id NULL, and the
-- post-load fixup step later fills/clones them onto variant vehicles. Because
-- NULLs never conflict in the UNIQUE(uuid, vehicle_id) constraint, each load
-- re-inserts a fresh NULL row alongside the previously-filled ones — bounded
-- residue (found by the verify_load gate: suit lockers 31 rows for 12 lockers).
--
-- Delete NULL rows whose uuid already has a vehicle-resolved row (pure
-- residue). NULL rows for uuids with NO resolved row are kept: those are
-- genuinely unmatched lockers (shared/generic entities like Locker_Suit_Left_AEGS)
-- and deleting them would lose real data.
DELETE FROM vehicle_suit_lockers
 WHERE vehicle_id IS NULL
   AND uuid IN (SELECT uuid FROM vehicle_suit_lockers WHERE vehicle_id IS NOT NULL);

DELETE FROM vehicle_weapon_racks
 WHERE vehicle_id IS NULL
   AND uuid IN (SELECT uuid FROM vehicle_weapon_racks WHERE vehicle_id IS NOT NULL);
