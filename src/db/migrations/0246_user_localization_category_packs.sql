-- Localization Builder: per-category pack assignment. Stores a JSON map of
-- categoryId → packName so a user can route specific string categories (ship
-- names, items, …) to specific community packs.
ALTER TABLE user_localization_configs ADD COLUMN category_packs_json TEXT;
