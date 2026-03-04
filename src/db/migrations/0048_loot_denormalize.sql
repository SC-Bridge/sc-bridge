-- Denormalize manufacturer_name and category onto loot_map
-- Eliminates 8 correlated CASE subqueries per row in getLootItems()

ALTER TABLE loot_map ADD COLUMN manufacturer_name TEXT;
ALTER TABLE loot_map ADD COLUMN category TEXT;

-- Backfill manufacturer_name from each FK branch
UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_weapons t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_weapon_id
) WHERE fps_weapon_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_armour t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_armour_id
) WHERE fps_armour_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_attachments t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_attachment_id
) WHERE fps_attachment_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_utilities t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_utility_id
) WHERE fps_utility_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_helmets t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_helmet_id
) WHERE fps_helmet_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM fps_clothing t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.fps_clothing_id
) WHERE fps_clothing_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM vehicle_components t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.vehicle_component_id
) WHERE vehicle_component_id IS NOT NULL;

UPDATE loot_map SET manufacturer_name = (
  SELECT m.name FROM ship_missiles t JOIN manufacturers m ON m.id = t.manufacturer_id WHERE t.id = loot_map.ship_missile_id
) WHERE ship_missile_id IS NOT NULL;

-- Filter out placeholder manufacturers
UPDATE loot_map SET manufacturer_name = NULL
  WHERE manufacturer_name IN ('<= PLACEHOLDER =>', '987')
     OR manufacturer_name LIKE '@%';

-- Backfill category from FK presence (matches LOOT_CATEGORY_CASE logic)
UPDATE loot_map SET category = 'weapon' WHERE fps_weapon_id IS NOT NULL;
UPDATE loot_map SET category = 'armour' WHERE fps_armour_id IS NOT NULL;
UPDATE loot_map SET category = 'attachment' WHERE fps_attachment_id IS NOT NULL;
UPDATE loot_map SET category = 'utility' WHERE fps_utility_id IS NOT NULL;
UPDATE loot_map SET category = 'helmet' WHERE fps_helmet_id IS NOT NULL;
UPDATE loot_map SET category = 'clothing' WHERE fps_clothing_id IS NOT NULL;
UPDATE loot_map SET category = 'consumable' WHERE consumable_id IS NOT NULL;
UPDATE loot_map SET category = 'harvestable' WHERE harvestable_id IS NOT NULL;
UPDATE loot_map SET category = 'prop' WHERE props_id IS NOT NULL;
UPDATE loot_map SET category = 'ship_component' WHERE vehicle_component_id IS NOT NULL;
UPDATE loot_map SET category = 'missile' WHERE ship_missile_id IS NOT NULL;
UPDATE loot_map SET category = 'unknown' WHERE category IS NULL;

-- Index on category for filtered queries
CREATE INDEX IF NOT EXISTS idx_loot_map_category ON loot_map(category);
