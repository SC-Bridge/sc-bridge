-- Carrying capacity for armour pieces and backpacks, in µSCU.
--
-- fps_armour.inventory_volume is the item's OWN size (how much room it takes
-- up), not how much it holds. The loadout page showed a backpack's own size as
-- its "carry" figure, so every backpack read "0K µSCU carry". The game keeps
-- the capacity in the inventorycontainers record the item links to (tools
-- pipeline, enrich/extractors.py extract_armour), e.g. the Pembroke Backpack
-- holds 180000 µSCU ("180K µSCU" in its description). fps_clothing already has
-- this column (0082); the pipeline now fills both tables.
--
-- Nullable: NULL = the item has no container (arms, helmets-in-armour, etc.).
-- Also added to ptu_fps_armour: the Loot DB query reads it through resolveTable
-- in PTU mode, and ptu_fps_clothing already has the column.
ALTER TABLE fps_armour ADD COLUMN storage_capacity INTEGER;
ALTER TABLE ptu_fps_armour ADD COLUMN storage_capacity INTEGER;
