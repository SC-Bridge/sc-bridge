-- Add flag to mark "paints" that are actually base ship variants (not real paints).
-- These should be filtered from paint listings but kept in DB for reference.
ALTER TABLE paints ADD COLUMN is_base_variant INTEGER DEFAULT 0;

-- Mark known base ship variants
UPDATE paints SET is_base_variant = 1 WHERE class_name IN (
  'Paint_Dragonfly_Default',
  'Paint_Dragonfly_Yellow',
  'Paint_Talon_Default',
  'Paint_Mustang_Beta',
  'Paint_Mustang_Delta',
  'Paint_Mustang_Delta_NineTails',
  'Paint_Mustang_Gamma',
  'Paint_Mustang_Omega',
  'Paint_Nox_Racing_White_Pink_Blue',
  'Paint_Reliant_Mako',
  'Paint_Reliant_Sen',
  'Paint_Reliant_Tana'
);
