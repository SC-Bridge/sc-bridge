-- Backfill 37 ships that exist in the RSI pledge store but are absent from SC Wiki.
-- SC Wiki is our primary data source; ships it hasn't documented simply don't exist in
-- our DB yet. This migration inserts them with RSI images so they appear in ShipDB
-- immediately rather than waiting for SC Wiki to catch up.
--
-- INSERT OR IGNORE (ON CONFLICT slug DO NOTHING) — safe to re-run; no-ops if slug exists.
-- If SC Wiki later documents these ships, its sync will UPDATE the existing row via
-- ON CONFLICT(slug) DO UPDATE, adding specs/dims without touching our image URLs.
--
-- Image URL columns:
--   image_url        = store_large  (effective display URL)
--   image_url_small  = store_small  (card thumbnails)
--   image_url_medium = store_large  (medium display)
--   image_url_large  = store_hub_large (hero/detail views)
--
-- Valkyrie Liberator Edition has a broken relative-path storeSmall URL from RSI;
-- inserted with NULL images so ShipImage falls back to the base Valkyrie image.

-- Argo Astronautics
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'arrastra', 'Arrastra',
  (SELECT id FROM manufacturers WHERE name = 'Argo Astronautics'),
  1, 0,
  'https://media.robertsspaceindustries.com/s77g3dj3gwes9/store_large.jpg',
  'https://media.robertsspaceindustries.com/s77g3dj3gwes9/store_small.jpg',
  'https://media.robertsspaceindustries.com/s77g3dj3gwes9/store_large.jpg',
  'https://media.robertsspaceindustries.com/s77g3dj3gwes9/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/arrastra/Arrastra'
);

-- Origin Jumpworks
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'carrack-w-c8x', 'Carrack w/C8X',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/twlkwwqy2mmk2/store_large.jpg',
  'https://media.robertsspaceindustries.com/twlkwwqy2mmk2/store_small.jpg',
  'https://media.robertsspaceindustries.com/twlkwwqy2mmk2/store_large.jpg',
  'https://media.robertsspaceindustries.com/twlkwwqy2mmk2/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/carrack/Carrack-W-C8X'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'carrack-expedition-w-c8x', 'Carrack Expedition w/C8X',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/1k5nfi962y4pp/store_large.jpg',
  'https://media.robertsspaceindustries.com/1k5nfi962y4pp/store_small.jpg',
  'https://media.robertsspaceindustries.com/1k5nfi962y4pp/store_large.jpg',
  'https://media.robertsspaceindustries.com/1k5nfi962y4pp/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/carrack/Carrack-Expedition-W-C8X'
);

-- Drake Interplanetary — Best In Show 2949 editions
-- Names match the shipNameMap mapped values so RSI sync can find and update them.
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'caterpillar-2949-best-in-show-edition', 'Caterpillar 2949 Best In Show Edition',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/1r1vf9peutpr0/store_large.jpg',
  'https://media.robertsspaceindustries.com/1r1vf9peutpr0/store_small.jpg',
  'https://media.robertsspaceindustries.com/1r1vf9peutpr0/store_large.jpg',
  'https://media.robertsspaceindustries.com/1r1vf9peutpr0/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/drake-caterpillar/Caterpillar-Best-In-Show-Edition-2949'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'cutlass-black-2949-best-in-show-edition', 'Cutlass Black 2949 Best In Show Edition',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/vt0f0g30nua1v/store_large.jpg',
  'https://media.robertsspaceindustries.com/vt0f0g30nua1v/store_small.jpg',
  'https://media.robertsspaceindustries.com/vt0f0g30nua1v/store_large.jpg',
  'https://media.robertsspaceindustries.com/vt0f0g30nua1v/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/drake-cutlass/Cutlass-Black-Best-In-Show-Edition-2949'
);

-- Anvil Aerospace
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'crucible', 'Crucible',
  (SELECT id FROM manufacturers WHERE name = 'Anvil Aerospace'),
  1, 0,
  'https://media.robertsspaceindustries.com/q81gvelwf2usv/store_large.jpg',
  'https://media.robertsspaceindustries.com/q81gvelwf2usv/store_small.jpg',
  'https://media.robertsspaceindustries.com/q81gvelwf2usv/store_large.jpg',
  'https://media.robertsspaceindustries.com/q81gvelwf2usv/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/crucible/Crucible'
);

-- Crusader Industries
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'e1-spirit', 'E1 Spirit',
  (SELECT id FROM manufacturers WHERE name = 'Crusader Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/mijopoh0bk9pb/store_large.jpg',
  'https://media.robertsspaceindustries.com/mijopoh0bk9pb/store_small.jpg',
  'https://media.robertsspaceindustries.com/mijopoh0bk9pb/store_large.jpg',
  'https://media.robertsspaceindustries.com/mijopoh0bk9pb/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/spirit/E1-Spirit'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'genesis', 'Genesis',
  (SELECT id FROM manufacturers WHERE name = 'Crusader Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/gpdjd9p1jnxj4/store_large.jpg',
  'https://media.robertsspaceindustries.com/gpdjd9p1jnxj4/store_small.jpg',
  'https://media.robertsspaceindustries.com/gpdjd9p1jnxj4/store_large.jpg',
  'https://media.robertsspaceindustries.com/gpdjd9p1jnxj4/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/starliner/Genesis'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'ironclad', 'Ironclad',
  (SELECT id FROM manufacturers WHERE name = 'Crusader Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/gtz4uouxebp3u/store_large.jpg',
  'https://media.robertsspaceindustries.com/gtz4uouxebp3u/store_small.jpg',
  'https://media.robertsspaceindustries.com/gtz4uouxebp3u/store_large.jpg',
  'https://media.robertsspaceindustries.com/gtz4uouxebp3u/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/ironclad/Ironclad'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'ironclad-assault', 'Ironclad Assault',
  (SELECT id FROM manufacturers WHERE name = 'Crusader Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/b1ahi2h8tnmsa/store_large.jpg',
  'https://media.robertsspaceindustries.com/b1ahi2h8tnmsa/store_small.jpg',
  'https://media.robertsspaceindustries.com/b1ahi2h8tnmsa/store_large.jpg',
  'https://media.robertsspaceindustries.com/b1ahi2h8tnmsa/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/ironclad/Ironclad-Assault'
);

-- Musashi Industrial & Starflight Concern (MISC)
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'endeavor', 'Endeavor',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/ymfdp7ow9lm5c/store_large.jpeg',
  'https://media.robertsspaceindustries.com/ymfdp7ow9lm5c/store_small.jpeg',
  'https://media.robertsspaceindustries.com/ymfdp7ow9lm5c/store_large.jpeg',
  'https://media.robertsspaceindustries.com/ymfdp7ow9lm5c/store_hub_large.jpeg',
  'https://robertsspaceindustries.com/pledge/ships/misc-endeavor/Endeavor'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'hull-b', 'Hull B',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/5r7g9f96lvwfz/store_large.jpg',
  'https://media.robertsspaceindustries.com/5r7g9f96lvwfz/store_small.jpg',
  'https://media.robertsspaceindustries.com/5r7g9f96lvwfz/store_large.jpg',
  'https://media.robertsspaceindustries.com/5r7g9f96lvwfz/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/hull/Hull-B'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'hull-d', 'Hull D',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/1j6650dnbblli/store_large.jpg',
  'https://media.robertsspaceindustries.com/1j6650dnbblli/store_small.jpg',
  'https://media.robertsspaceindustries.com/1j6650dnbblli/store_large.jpg',
  'https://media.robertsspaceindustries.com/1j6650dnbblli/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/hull/Hull-D'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'hull-e', 'Hull E',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/k6fla3wync6cr/store_large.jpg',
  'https://media.robertsspaceindustries.com/k6fla3wync6cr/store_small.jpg',
  'https://media.robertsspaceindustries.com/k6fla3wync6cr/store_large.jpg',
  'https://media.robertsspaceindustries.com/k6fla3wync6cr/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/hull/Hull-E'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'odyssey', 'Odyssey',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/xpz8d5rv7fl2b/store_large.jpg',
  'https://media.robertsspaceindustries.com/xpz8d5rv7fl2b/store_small.jpg',
  'https://media.robertsspaceindustries.com/xpz8d5rv7fl2b/store_large.jpg',
  'https://media.robertsspaceindustries.com/xpz8d5rv7fl2b/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/odyssey/Odyssey'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'pioneer', 'Pioneer',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/vtodzxlks918l/store_large.jpeg',
  'https://media.robertsspaceindustries.com/vtodzxlks918l/store_small.jpeg',
  'https://media.robertsspaceindustries.com/vtodzxlks918l/store_large.jpeg',
  'https://media.robertsspaceindustries.com/vtodzxlks918l/store_hub_large.jpeg',
  'https://robertsspaceindustries.com/pledge/ships/pioneer/Pioneer'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'vulcan', 'Vulcan',
  (SELECT id FROM manufacturers WHERE name = 'Musashi Industrial & Starflight Concern'),
  1, 0,
  'https://media.robertsspaceindustries.com/6q50bb3oy5q8b/store_large.jpg',
  'https://media.robertsspaceindustries.com/6q50bb3oy5q8b/store_small.jpg',
  'https://media.robertsspaceindustries.com/6q50bb3oy5q8b/store_large.jpg',
  'https://media.robertsspaceindustries.com/6q50bb3oy5q8b/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/vulcan/Vulcan'
);

-- Drake Interplanetary
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'expanse', 'Expanse',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/wphusii1dnmxt/store_large.jpg',
  'https://media.robertsspaceindustries.com/wphusii1dnmxt/store_small.jpg',
  'https://media.robertsspaceindustries.com/wphusii1dnmxt/store_large.jpg',
  'https://media.robertsspaceindustries.com/wphusii1dnmxt/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/expanse/Expanse'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'kraken', 'Kraken',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/nnpwaac1eqp4p/store_large.jpg',
  'https://media.robertsspaceindustries.com/nnpwaac1eqp4p/store_small.jpg',
  'https://media.robertsspaceindustries.com/nnpwaac1eqp4p/store_large.jpg',
  'https://media.robertsspaceindustries.com/nnpwaac1eqp4p/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/drake-kraken/Kraken'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'kraken-privateer', 'Kraken Privateer',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/nnu9953me3vod/store_large.jpg',
  'https://media.robertsspaceindustries.com/nnu9953me3vod/store_small.jpg',
  'https://media.robertsspaceindustries.com/nnu9953me3vod/store_large.jpg',
  'https://media.robertsspaceindustries.com/nnu9953me3vod/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/drake-kraken/Kraken-Privateer'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'legionnaire', 'Legionnaire',
  (SELECT id FROM manufacturers WHERE name = 'Drake Interplanetary'),
  1, 0,
  'https://media.robertsspaceindustries.com/qxgdodjdhuvsr/store_large.jpeg',
  'https://media.robertsspaceindustries.com/qxgdodjdhuvsr/store_small.jpeg',
  'https://media.robertsspaceindustries.com/qxgdodjdhuvsr/store_large.jpeg',
  'https://media.robertsspaceindustries.com/qxgdodjdhuvsr/store_hub_large.jpeg',
  'https://robertsspaceindustries.com/pledge/ships/legionnaire/Legionnaire'
);

-- Anvil Aerospace
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'liberator', 'Liberator',
  (SELECT id FROM manufacturers WHERE name = 'Anvil Aerospace'),
  1, 0,
  'https://media.robertsspaceindustries.com/k2zu1md2ulfxh/store_large.png',
  'https://media.robertsspaceindustries.com/k2zu1md2ulfxh/store_small.png',
  'https://media.robertsspaceindustries.com/k2zu1md2ulfxh/store_large.png',
  'https://media.robertsspaceindustries.com/k2zu1md2ulfxh/store_hub_large.png',
  'https://robertsspaceindustries.com/pledge/ships/liberator/Liberator'
);

-- Banu
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'merchantman', 'Merchantman',
  (SELECT id FROM manufacturers WHERE name = 'Banu'),
  1, 0,
  'https://media.robertsspaceindustries.com/gmtme5pca7eis/store_large.jpg',
  'https://media.robertsspaceindustries.com/gmtme5pca7eis/store_small.jpg',
  'https://media.robertsspaceindustries.com/gmtme5pca7eis/store_large.jpg',
  'https://media.robertsspaceindustries.com/gmtme5pca7eis/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/merchantman/Merchantman'
);

-- Consolidated Outland
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'mustang-alpha-vindicator', 'Mustang Alpha Vindicator',
  (SELECT id FROM manufacturers WHERE name = 'Consolidated Outland'),
  1, 0,
  'https://media.robertsspaceindustries.com/iohmvf24h4rsz/store_large.png',
  'https://media.robertsspaceindustries.com/iohmvf24h4rsz/store_small.png',
  'https://media.robertsspaceindustries.com/iohmvf24h4rsz/store_large.png',
  'https://media.robertsspaceindustries.com/iohmvf24h4rsz/store_hub_large.png',
  'https://robertsspaceindustries.com/pledge/ships/mustang/Mustang-Alpha-Vindicator'
);

-- Aegis Dynamics
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'nautilus', 'Nautilus',
  (SELECT id FROM manufacturers WHERE name = 'Aegis Dynamics'),
  1, 0,
  'https://media.robertsspaceindustries.com/c6t6mr400hgx6/store_large.jpg',
  'https://media.robertsspaceindustries.com/c6t6mr400hgx6/store_small.jpg',
  'https://media.robertsspaceindustries.com/c6t6mr400hgx6/store_large.jpg',
  'https://media.robertsspaceindustries.com/c6t6mr400hgx6/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/aegis-nautilus/Nautilus'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'nautilus-solstice-edition', 'Nautilus Solstice Edition',
  (SELECT id FROM manufacturers WHERE name = 'Aegis Dynamics'),
  1, 0,
  'https://media.robertsspaceindustries.com/mp9p2pzrvdxw9/store_large.jpg',
  'https://media.robertsspaceindustries.com/mp9p2pzrvdxw9/store_small.jpg',
  'https://media.robertsspaceindustries.com/mp9p2pzrvdxw9/store_large.jpg',
  'https://media.robertsspaceindustries.com/mp9p2pzrvdxw9/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/aegis-nautilus/Nautilus-Solstice-Edition'
);

-- Roberts Space Industries (RSI)
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'galaxy', 'Galaxy',
  (SELECT id FROM manufacturers WHERE name = 'Roberts Space Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/b2bx2kl8ewqej/store_large.jpg',
  'https://media.robertsspaceindustries.com/b2bx2kl8ewqej/store_small.jpg',
  'https://media.robertsspaceindustries.com/b2bx2kl8ewqej/store_large.jpg',
  'https://media.robertsspaceindustries.com/b2bx2kl8ewqej/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/galaxy/Galaxy'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'orion', 'Orion',
  (SELECT id FROM manufacturers WHERE name = 'Roberts Space Industries'),
  1, 0,
  'https://media.robertsspaceindustries.com/b3nwvt5ye3zj0/store_large.jpg',
  'https://media.robertsspaceindustries.com/b3nwvt5ye3zj0/store_small.jpg',
  'https://media.robertsspaceindustries.com/b3nwvt5ye3zj0/store_large.jpg',
  'https://media.robertsspaceindustries.com/b3nwvt5ye3zj0/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/orion/Orion'
);

-- Origin Jumpworks — G12 variants
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'g12', 'G12',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/brmi1ci9rthmu/store_large.jpg',
  'https://media.robertsspaceindustries.com/brmi1ci9rthmu/store_small.jpg',
  'https://media.robertsspaceindustries.com/brmi1ci9rthmu/store_large.jpg',
  'https://media.robertsspaceindustries.com/brmi1ci9rthmu/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/origin-g12/G12'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'g12a', 'G12a',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/2btmuamt8zv4g/store_large.jpg',
  'https://media.robertsspaceindustries.com/2btmuamt8zv4g/store_small.jpg',
  'https://media.robertsspaceindustries.com/2btmuamt8zv4g/store_large.jpg',
  'https://media.robertsspaceindustries.com/2btmuamt8zv4g/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/origin-g12/G12a'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'g12r', 'G12r',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/ou0nkzhocb2bd/store_large.jpg',
  'https://media.robertsspaceindustries.com/ou0nkzhocb2bd/store_small.jpg',
  'https://media.robertsspaceindustries.com/ou0nkzhocb2bd/store_large.jpg',
  'https://media.robertsspaceindustries.com/ou0nkzhocb2bd/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/origin-g12/G12r'
);

-- Origin Jumpworks — Zeus Mk II MR
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'zeus-mk-ii-mr', 'Zeus Mk II MR',
  (SELECT id FROM manufacturers WHERE name = 'Origin Jumpworks'),
  1, 0,
  'https://media.robertsspaceindustries.com/pj51owg973q4b/store_large.jpg',
  'https://media.robertsspaceindustries.com/pj51owg973q4b/store_small.jpg',
  'https://media.robertsspaceindustries.com/pj51owg973q4b/store_large.jpg',
  'https://media.robertsspaceindustries.com/pj51owg973q4b/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/zeus-mk-ii/Zeus-Mk-II-MR'
);

-- Gatac Manufacture
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'railen', 'Railen',
  (SELECT id FROM manufacturers WHERE name = 'Gatac Manufacture'),
  1, 0,
  'https://media.robertsspaceindustries.com/i3aybjtr4j7fq/store_large.jpg',
  'https://media.robertsspaceindustries.com/i3aybjtr4j7fq/store_small.jpg',
  'https://media.robertsspaceindustries.com/i3aybjtr4j7fq/store_large.jpg',
  'https://media.robertsspaceindustries.com/i3aybjtr4j7fq/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/railen/Railen'
);

-- Tumbril Land Systems
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'ranger-cv', 'Ranger CV',
  (SELECT id FROM manufacturers WHERE name = 'Tumbril Land Systems'),
  1, 0,
  'https://media.robertsspaceindustries.com/1pe4mpq4m650v/store_large.jpg',
  'https://media.robertsspaceindustries.com/1pe4mpq4m650v/store_small.jpg',
  'https://media.robertsspaceindustries.com/1pe4mpq4m650v/store_large.jpg',
  'https://media.robertsspaceindustries.com/1pe4mpq4m650v/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-CV'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'ranger-rc', 'Ranger RC',
  (SELECT id FROM manufacturers WHERE name = 'Tumbril Land Systems'),
  1, 0,
  'https://media.robertsspaceindustries.com/86p4ac1l3rmra/store_large.jpg',
  'https://media.robertsspaceindustries.com/86p4ac1l3rmra/store_small.jpg',
  'https://media.robertsspaceindustries.com/86p4ac1l3rmra/store_large.jpg',
  'https://media.robertsspaceindustries.com/86p4ac1l3rmra/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-RC'
);

INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'ranger-tr', 'Ranger TR',
  (SELECT id FROM manufacturers WHERE name = 'Tumbril Land Systems'),
  1, 0,
  'https://media.robertsspaceindustries.com/eehhr9ql9y04w/store_large.jpg',
  'https://media.robertsspaceindustries.com/eehhr9ql9y04w/store_small.jpg',
  'https://media.robertsspaceindustries.com/eehhr9ql9y04w/store_large.jpg',
  'https://media.robertsspaceindustries.com/eehhr9ql9y04w/store_hub_large.jpg',
  'https://robertsspaceindustries.com/pledge/ships/tumbril-ranger/Ranger-TR'
);

-- Anvil Aerospace — Valkyrie Liberator Edition
-- RSI storeSmall URL is a broken relative path; inserting with NULL images.
-- ShipImage component will fall back to the base Valkyrie vehicle image.
INSERT OR IGNORE INTO vehicles (slug, name, manufacturer_id, on_sale, is_paint_variant,
  image_url, image_url_small, image_url_medium, image_url_large, pledge_url)
VALUES (
  'valkyrie-liberator-edition', 'Valkyrie Liberator Edition',
  (SELECT id FROM manufacturers WHERE name = 'Anvil Aerospace'),
  1, 0,
  NULL, NULL, NULL, NULL,
  'https://robertsspaceindustries.com/pledge/ships/anvil-valkyrie/Valkyrie-Liberator-Edition'
);
