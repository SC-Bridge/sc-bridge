-- Fix reward text: replace generic "Wikelo-variant ship" with actual ship names
-- and fix crafted/clothing reward descriptions
-- Vehicle Delivery rewards (39 contracts)
UPDATE contracts SET reward_text = 'Fortune Wikelo Special' WHERE id = 22;
UPDATE contracts SET reward_text = 'Nox Wikelo Special' WHERE id = 23;
UPDATE contracts SET reward_text = 'Intrepid Wikelo Work Special' WHERE id = 24;
UPDATE contracts SET reward_text = 'Mirai Pulse (Wikelo Edition)' WHERE id = 25;
UPDATE contracts SET reward_text = 'Ursa Medivac Wikelo Special' WHERE id = 26;
UPDATE contracts SET reward_text = 'Guardian QI Wikelo Special' WHERE id = 27;
UPDATE contracts SET reward_text = 'Sabre Firebird Wikelo War Special' WHERE id = 28;
UPDATE contracts SET reward_text = 'Scorpius Wikelo Sneak Special' WHERE id = 29;
UPDATE contracts SET reward_text = 'F7 Hornet Mk Wikelo' WHERE id = 30;
UPDATE contracts SET reward_text = 'Zeus Mk II ES Wikelo Work Special' WHERE id = 31;
UPDATE contracts SET reward_text = 'Zeus Mk II CL (Wikelo Edition)' WHERE id = 32;
UPDATE contracts SET reward_text = 'Sabre Peregrine Wikelo Speedy Special' WHERE id = 33;
UPDATE contracts SET reward_text = 'C1 Spirit Wikelo Special' WHERE id = 34;
UPDATE contracts SET reward_text = 'F8C Lightning Wikelo War Special' WHERE id = 35;
UPDATE contracts SET reward_text = 'F8C Lightning Wikelo Sneak Special' WHERE id = 36;
UPDATE contracts SET reward_text = 'Starlancer MAX Wikelo Work Special' WHERE id = 37;
UPDATE contracts SET reward_text = 'Constellation Taurus Wikelo War Special' WHERE id = 38;
UPDATE contracts SET reward_text = 'ARGO ATLS (Wikelo Ikti Edition)' WHERE id = 39;
UPDATE contracts SET reward_text = 'ARGO ATLS (Wikelo Ikti+Geo Edition)' WHERE id = 40;
UPDATE contracts SET reward_text = 'RSI Polaris (Wikelo Edition)' WHERE id = 41;
UPDATE contracts SET reward_text = 'ARGO ATLS (Wikelo Red & Blue Paint)' WHERE id = 42;
UPDATE contracts SET reward_text = 'ARGO ATLS (Wikelo White & Green Paint)' WHERE id = 43;
UPDATE contracts SET reward_text = 'ARGO ATLS (Wikelo Orange & Grey Paint)' WHERE id = 44;
UPDATE contracts SET reward_text = 'Terrapin Medic Wikelo Savior Special' WHERE id = 45;
UPDATE contracts SET reward_text = 'Golem Wikelo Work Special' WHERE id = 46;
UPDATE contracts SET reward_text = 'Starlancer TAC Wikelo War Special' WHERE id = 47;
UPDATE contracts SET reward_text = 'A2 Hercules Starlifter Wikelo War Special' WHERE id = 48;
UPDATE contracts SET reward_text = 'Ares Star Fighter Ion Wikelo Sneak Special' WHERE id = 49;
UPDATE contracts SET reward_text = 'Ares Star Fighter Inferno Wikelo War Special' WHERE id = 50;
UPDATE contracts SET reward_text = 'Prowler Utility Wikelo Work Special' WHERE id = 51;
UPDATE contracts SET reward_text = 'Guardian Wikelo War Special' WHERE id = 52;
UPDATE contracts SET reward_text = 'Guardian MX Wikelo War Special' WHERE id = 53;
UPDATE contracts SET reward_text = 'Meteor Wikelo Sneak Special' WHERE id = 54;
UPDATE contracts SET reward_text = 'Prospector Wikelo Work Special' WHERE id = 55;
UPDATE contracts SET reward_text = 'RAFT Wikelo Work Special' WHERE id = 56;
UPDATE contracts SET reward_text = 'Asgard Wikelo War Special' WHERE id = 57;
UPDATE contracts SET reward_text = 'L-21 Wolf Wikelo Sneak Special' WHERE id = 58;
UPDATE contracts SET reward_text = 'L-21 Wolf Wikelo War Special' WHERE id = 59;
UPDATE contracts SET reward_text = 'Idris-P Wikelo War Special' WHERE id = 60;

-- Crafted item reward (1 contract)
UPDATE contracts SET reward_text = 'Tripledown "Heatwave" Pistol' WHERE id = 14;

-- Clothing reward contracts use generic template — rewards are randomized each time
UPDATE contracts SET reward_text = 'Clothing items (randomized)' WHERE id = 15;
UPDATE contracts SET reward_text = 'Clothing items (randomized)' WHERE id = 16;
