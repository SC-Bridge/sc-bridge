-- Second pass backfill for vehicle_ports: remaining unassigned component ports.

-- 1. Core components that missed assignment (PowerPlant, Cooler, QuantumDrive, Shield)
UPDATE vehicle_ports SET port_type = 'power', category_label = 'Power'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'PowerPlant'
  );

UPDATE vehicle_ports SET port_type = 'cooler', category_label = 'Cooling'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'Cooler'
  );

UPDATE vehicle_ports SET port_type = 'quantum_drive', category_label = 'Quantum Drive'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'QuantumDrive'
  );

UPDATE vehicle_ports SET port_type = 'shield', category_label = 'Shields'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'Shield'
  );

-- 2. Top-level WeaponGun ports that directly equip a weapon (no mount bracket):
--    Ares S7 cannon, Vanguard fixed nose guns, Idris railgun, Mustang Delta rockets,
--    P-52 Merlin, X1 variants, etc.
UPDATE vehicle_ports SET port_type = 'weapon', category_label = 'Weapons'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'WeaponGun'
  );
