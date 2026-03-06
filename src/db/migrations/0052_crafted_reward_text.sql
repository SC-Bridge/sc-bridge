-- Fix remaining "Crafted weapon, armor, or item" reward text with specific item names
-- Weapon rewards (from game localization item_Name*_collector* entries)
UPDATE contracts SET reward_text = 'Prism "Irradiated" Laser Shotgun' WHERE id = 5;
UPDATE contracts SET reward_text = 'Zenith "Snow Camo" Laser Sniper Rifle' WHERE id = 6;
UPDATE contracts SET reward_text = 'Fresnel "Yormandi" Energy LMG' WHERE id = 10;
UPDATE contracts SET reward_text = 'Boomtube "Clanguard" Rocket Launcher' WHERE id = 13;
UPDATE contracts SET reward_text = 'Tripledown "Heatwave" Pistol' WHERE id = 14;

-- Armor/suit rewards (crafted by Wikelo — names from contract title/description context)
UPDATE contracts SET reward_text = 'Irradiated Armor Set' WHERE id = 4;
UPDATE contracts SET reward_text = 'Geist Armor Snow Camo Set' WHERE id = 7;
UPDATE contracts SET reward_text = 'Molten Armor Set' WHERE id = 8;
UPDATE contracts SET reward_text = 'Heavy Utility Suit' WHERE id = 9;
UPDATE contracts SET reward_text = 'Battle Armor Set' WHERE id = 11;
UPDATE contracts SET reward_text = 'Vanduul-style Armor Set' WHERE id = 12;
