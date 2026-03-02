-- Add quantity tracking to loot collection and wishlist
-- Allows users to track how many copies they have collected / want to acquire

ALTER TABLE user_loot_collection ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_loot_wishlist    ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
