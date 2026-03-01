-- Backfill vehicle_ports port_type and category_label for component types
-- that were missed in the original ship_ports extraction.

-- 1. Fix existing ports that have port_type but missing category_label
UPDATE vehicle_ports SET category_label = 'Cooling'
  WHERE port_type = 'cooler' AND category_label IS NULL;
UPDATE vehicle_ports SET category_label = 'Missiles'
  WHERE port_type = 'missile' AND category_label IS NULL;
UPDATE vehicle_ports SET category_label = 'Power'
  WHERE port_type = 'power' AND category_label IS NULL;
UPDATE vehicle_ports SET category_label = 'Sensors'
  WHERE port_type = 'sensor' AND category_label IS NULL;
UPDATE vehicle_ports SET category_label = 'Weapons'
  WHERE port_type = 'weapon' AND category_label IS NULL;
UPDATE vehicle_ports SET category_label = 'Turrets'
  WHERE port_type = 'turret' AND category_label IS NULL;

-- 2. Countermeasures (WeaponDefensive/CountermeasureLauncher that missed assignment)
UPDATE vehicle_ports SET port_type = 'countermeasure', category_label = 'Countermeasures'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components
    WHERE type = 'WeaponDefensive' AND sub_type = 'CountermeasureLauncher'
  );

-- 3. Missile racks (MissileLauncher that missed assignment)
UPDATE vehicle_ports SET port_type = 'missile', category_label = 'Missiles'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'MissileLauncher'
  );

-- 4. Turrets (TurretBase that missed assignment)
UPDATE vehicle_ports SET port_type = 'turret', category_label = 'Turrets'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'TurretBase'
  );

-- 5. Jump Drive
UPDATE vehicle_ports SET port_type = 'jump_drive', category_label = 'Jump Drive'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'JumpDrive'
  );

-- 6. QED (Quantum Enforcement Device)
UPDATE vehicle_ports SET port_type = 'qed', category_label = 'Quantum Enforcement Device'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'QuantumInterdictionGenerator'
  );

-- 7. Mining Laser
UPDATE vehicle_ports SET port_type = 'mining_laser', category_label = 'Mining Laser'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'WeaponMining'
  );

-- 8. Salvage Head
UPDATE vehicle_ports SET port_type = 'salvage_head', category_label = 'Salvage Head'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'SalvageHead'
  );

-- 9. Salvage Module (scraper modules + tractor beam modules)
UPDATE vehicle_ports SET port_type = 'salvage_module', category_label = 'Salvage Module'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'SalvageModifier'
  );

-- 10. Radar/Scanner → existing 'sensor' type
UPDATE vehicle_ports SET port_type = 'sensor', category_label = 'Sensors'
WHERE port_type IS NULL
  AND equipped_item_uuid IN (
    SELECT uuid FROM vehicle_components WHERE type = 'Radar'
  );

-- 11. Weapon mounts: parent ports of WeaponGun/MissileLauncher child ports
--     whose equipped item is not a tracked component (WeaponMount bracket).
--     These are fixed/gimbal hardpoints where the weapon sits one level down.
UPDATE vehicle_ports SET port_type = 'weapon', category_label = 'Weapons'
WHERE port_type IS NULL
  AND EXISTS (
    SELECT 1 FROM vehicle_ports cp
    JOIN vehicle_components vc ON vc.uuid = cp.equipped_item_uuid
    WHERE cp.parent_port_id = vehicle_ports.id
      AND vc.type IN ('WeaponGun', 'MissileLauncher')
  )
  AND (
    equipped_item_uuid IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM vehicle_components WHERE uuid = vehicle_ports.equipped_item_uuid
    )
  );
