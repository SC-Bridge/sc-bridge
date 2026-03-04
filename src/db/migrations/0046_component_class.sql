-- Add class column directly to vehicle_components
-- Previously derived from manufacturers.class, but that approach is wrong:
-- 1. 5/21 manufacturer->class mappings were incorrect
-- 2. Some manufacturers (AEGS, ORIG) make components of multiple classes
-- 3. The class data was lost when manufacturers table was rebuilt in migration 0037
--
-- Class is now extracted from component description text ("Class: Competition\n...")
-- and stored per-component. Manufacturer class remains as fallback for items without
-- description-based class (capital ship bespoke items).

ALTER TABLE vehicle_components ADD COLUMN class TEXT;

-- Repopulate manufacturers.class with corrected values
-- (lost during 0037 table rebuild, and 5 were wrong in original 0031 mapping)

-- Competition class
UPDATE manufacturers SET class = 'Competition' WHERE code = 'ACOM';
UPDATE manufacturers SET class = 'Competition' WHERE code = 'ACAS';
UPDATE manufacturers SET class = 'Competition' WHERE code = 'YORM';

-- Military class
UPDATE manufacturers SET class = 'Military'    WHERE code IN ('AEG', 'AMRS', 'GODI', 'WETK');
UPDATE manufacturers SET class = 'Military'    WHERE code = 'BANU';

-- Stealth class
UPDATE manufacturers SET class = 'Stealth'     WHERE code IN ('ASAS', 'RACO', 'TYDT');

-- Civilian class
UPDATE manufacturers SET class = 'Civilian'    WHERE code IN ('BEH', 'WCPR', 'LPLT', 'ARCC', 'JSPN', 'ORIG', 'RSI', 'SECO', 'TARS', 'SASU');

-- Industrial class
UPDATE manufacturers SET class = 'Industrial'  WHERE code IN ('BASL', 'JUST');
