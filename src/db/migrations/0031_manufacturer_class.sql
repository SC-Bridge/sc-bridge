-- Add component class to manufacturers.
-- Class is NOT stored in DataCore component JSONs (SubType is always "UNDEFINED").
-- It is determined by manufacturer identity, confirmed via:
--   - Loot file naming convention: loot_{type}_{size}_{grade}_{mfr}_{name}_{class}.json
--   - User examples: LPLT=Civilian, WETK=Military, BASL=Industrial
--   - SC lore/community knowledge for remaining brands

ALTER TABLE manufacturers ADD COLUMN class TEXT;

-- Confirmed from DataCore loot file naming (ground truth)
UPDATE manufacturers SET class = 'Military'     WHERE code IN ('AEG', 'AMRS', 'GODI', 'WETK');
UPDATE manufacturers SET class = 'Competition'  WHERE code IN ('ACOM');
UPDATE manufacturers SET class = 'Stealth'      WHERE code IN ('ASAS', 'RACO', 'TYDT');

-- User-confirmed examples
UPDATE manufacturers SET class = 'Civilian'     WHERE code IN ('LPLT');
UPDATE manufacturers SET class = 'Industrial'   WHERE code IN ('BASL');

-- SC community knowledge (manufacturer identity)
UPDATE manufacturers SET class = 'Military'     WHERE code IN ('BEH');
UPDATE manufacturers SET class = 'Civilian'     WHERE code IN ('ACAS', 'ARCC', 'JSPN', 'ORIG', 'RSI', 'SECO', 'TARS', 'SASU');
UPDATE manufacturers SET class = 'Industrial'   WHERE code IN ('JUST', 'WCPR', 'YORM');
-- BANU: alien technology — no human class designation, left NULL
