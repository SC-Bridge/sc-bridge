---
description: Complete D1 database schema for SC Bridge — all tables, columns, FKs, indexes, and out-of-band columns as of migration 0031.
tags: [database, d1, schema, sqlite, migrations]
audience: { human: 30, agent: 70 }
purpose: { reference: 80, research: 20 }
---

# D1 Schema Reference

**Database:** `sc-companion` (Cloudflare D1, Oceania region)
**Last Migration:** `0031_manufacturer_class.sql`
**Convention doc:** `src/db/CONVENTIONS.md`

---

## Table Index

| Table | Rows (SC 4.6.0) | Purpose |
|-------|----------------|---------|
| `vehicles` | 303 | Ship specs and metadata |
| `vehicle_ports` | 25,797 | Hardpoints and equipment slots |
| `vehicle_components` | 2,080 | Ship components (weapons, coolers, shields…) |
| `vehicle_images` | 303 | Image URL source tracking (CF Images) |
| `vehicle_loaners` | varies | Loaner ship relationships |
| `paint_vehicles` | varies | Paint ↔ vehicle many-to-many |
| `paints` | ~200+ | Paint variants |
| `manufacturers` | 21+ | Ship and component manufacturers |
| `production_statuses` | 5 | Flight-ready, in-production, in-concept… |
| `vehicle_types` | 2 | Ship, Ground Vehicle |
| `game_versions` | varies | SC patch versions |
| `insurance_types` | varies | LTI, 120-month, 72-month… |
| `fps_weapons` | 404 | Personal firearms |
| `fps_armour` | 1,779 | Combat armor suits |
| `fps_attachments` | 488 | Weapon modifiers |
| `fps_utilities` | 50 | Grenades, gadgets, consumables |
| `fps_helmets` | 614 | Headgear |
| `fps_clothing` | 1,785 | Wearable clothing (incl. loot-only) |
| `consumables` | 206 | Food and drink |
| `harvestables` | 77 | Harvestable materials |
| `props` | 246 | Collectibles, misc props |
| `loot_map` | 5,218 | Master loot list with FK cross-refs |
| `user_fleet` | varies | User ship ownership |
| `user` | varies | Auth (Better Auth managed) |
| `user_rsi_profile` | varies | RSI account linkage |
| `user_paints` | varies | User paint ownership |
| `user_settings` | varies | UI preferences |
| `user_llm_configs` | varies | LLM API keys (encrypted) |
| `user_change_history` | varies | Audit trail |
| `change_event_types` | 16 | Audit event classification |
| `sync_history` | varies | Sync run records |
| `sync_sources` | 5 | SC Wiki, RSI, DataCore, etc. |
| `ai_analyses` | varies | Fleet analysis results |
| `app_settings` | varies | Global settings |
| `vehicle_images_archive` | varies | Historical image URLs (0013) |

---

## Core Reference Tables

### `manufacturers`
**Migration:** 0001 + extended by 0031

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `uuid` | TEXT NOT NULL UNIQUE | DataCore UUID |
| `name` | TEXT NOT NULL | "Roberts Space Industries" |
| `slug` | TEXT NOT NULL UNIQUE | |
| `code` | TEXT | "RSI", "ORIG", "WETK" — used for class mapping |
| `description` | TEXT | |
| `website` | TEXT | |
| `class` | TEXT | [0031] Civilian/Military/Industrial/Stealth/Competition/NULL |
| `created_at` | TEXT DEFAULT datetime('now') | |
| `updated_at` | TEXT DEFAULT datetime('now') | |

**Indexes:** `idx_manufacturers_slug`, `idx_manufacturers_code`

**Note:** DB uses `AEG` for Aegis Dynamics; DataCore loot files use `aegs`. Same manufacturer.

---

### `vehicles`
**Migration:** 0001 + multiple extensions

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `uuid` | TEXT NOT NULL UNIQUE | DataCore `_RecordId_` |
| `name` | TEXT NOT NULL | "F7C-M Super Hornet Heartseeker" |
| `slug` | TEXT NOT NULL UNIQUE | "f7c-m-super-hornet-heartseeker" |
| `class_name` | TEXT | DataCore class identifier |
| `description` | TEXT | |
| `vehicle_type_id` | INTEGER → vehicle_types | |
| `manufacturer_id` | INTEGER → manufacturers | |
| `production_status_id` | INTEGER → production_statuses | |
| `game_version_id` | INTEGER → game_versions | nullable |
| `is_paint_variant` | INTEGER DEFAULT 0 | [0009] cosmetic editions filtered from browser |
| `size` | INTEGER | 1–10 |
| `size_label` | TEXT | "Small", "Medium", "Large", "Capital" |
| `focus` | TEXT | "Bounty Hunting", "Exploration", "Hauling"… |
| `classification` | TEXT | |
| `length` | REAL | meters |
| `beam` | REAL | meters |
| `height` | REAL | meters |
| `mass` | REAL | kg |
| `cargo` | INTEGER | SCU |
| `crew_min` | INTEGER | |
| `crew_max` | INTEGER | |
| `speed_scm` | REAL | m/s |
| `speed_max` | REAL | m/s |
| `health` | REAL | hull HP |
| `vehicle_inventory` | REAL | SCU (internal storage) |
| `pledge_price` | REAL | USD |
| `on_sale` | INTEGER DEFAULT 0 | 1 = currently in pledge store |
| `pledge_url` | TEXT | RSI pledge store link |
| `image_url` | TEXT | Priority: CF > RSI > Wiki |
| `image_url_small` | TEXT | |
| `image_url_medium` | TEXT | |
| `image_url_large` | TEXT | |
| `price_auec` | INTEGER | **[OUT-OF-BAND]** aUEC in-game price |
| `acquisition_type` | TEXT | **[OUT-OF-BAND]** ingame_shop/ingame_quest/ingame_cz/pledge |
| `acquisition_source_name` | TEXT | **[OUT-OF-BAND]** Location/mission name |
| `created_at` | TEXT DEFAULT datetime('now') | |
| `updated_at` | TEXT DEFAULT datetime('now') | |

**Indexes:** `idx_vehicles_slug`, `idx_vehicles_production_status_id`, `idx_vehicles_manufacturer_id`

---

### `vehicle_images`
**Migration:** 0007, 0008, 0012, 0013

Source of truth for image URLs. One row per vehicle. `vehicle_images.cf_images_id` is the guard — when set, no lower-priority image will overwrite `vehicles.image_url`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `vehicle_id` | INTEGER NOT NULL UNIQUE → vehicles | |
| `cf_images_id` | TEXT | [0012] Cloudflare Images asset ID |
| `created_at` | TEXT DEFAULT datetime('now') | |
| `updated_at` | TEXT DEFAULT datetime('now') | |

**Indexes:** `idx_vehicle_images_vehicle_id`

---

### `vehicle_ports`
**Migration:** 0001 as `ports`, renamed 0029 to `vehicle_ports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `uuid` | TEXT NOT NULL UNIQUE | SHA1("{ship_uuid}:{port_name}") format |
| `vehicle_id` | INTEGER NOT NULL → vehicles | |
| `name` | TEXT | Port name (e.g., "hardpoint_gun_class4_left") |
| `category_label` | TEXT | "Weapons", "Shields", "Power", "Cooling"… NULL = non-player port |
| `size_min` | INTEGER | |
| `size_max` | INTEGER | |
| `port_type` | TEXT | |
| `equipped_item_uuid` | TEXT | UUID of mounted component |
| `parent_port_id` | INTEGER → vehicle_ports | For child ports (weapon inside a mount bracket) |
| `created_at` | TEXT DEFAULT datetime('now') | |
| `updated_at` | TEXT DEFAULT datetime('now') | |

**Indexes:** `idx_vehicle_ports_vehicle_id` [0030], `idx_vehicle_ports_parent_port_id` [0030]

**Key pattern:** `WHERE category_label IS NOT NULL` in loadout queries filters non-player ports.

---

### `vehicle_components`
**Migration:** 0001 as `components`, renamed 0017

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `uuid` | TEXT NOT NULL UNIQUE | DataCore `_RecordId_` |
| `class_name` | TEXT | DataCore class name |
| `name` | TEXT | Display name |
| `slug` | TEXT NOT NULL UNIQUE | |
| `description` | TEXT | |
| `type` | TEXT | "WeaponGun", "Cooler", "Shield", "PowerPlant"… |
| `sub_type` | TEXT | DataCore SubType (UNDEFINED→NULL) |
| `size` | INTEGER | Component size class 0–10 |
| `grade` | TEXT | A/B/C/D (1→A, 2→B, 3→C, 4→D) |
| `manufacturer_id` | INTEGER → manufacturers | |
| `stats_json` | TEXT | **[OUT-OF-BAND]** DataCore stats blob |
| `created_at` | TEXT DEFAULT datetime('now') | |
| `updated_at` | TEXT DEFAULT datetime('now') | |

**Indexes:** `idx_vehicle_components_slug`, `idx_vehicle_components_sub_type`

---

## Personal Gear (FPS)

All FPS tables follow the same pattern: `uuid` UNIQUE, `class_name`, `name`, `slug`, `description`, `manufacturer_id`, `stats_json` [OUT-OF-BAND].

### `fps_weapons` (404 rows)
Source: `DataCore/entities/scitem/weapons/fps_weapons/`

Additional columns: `weapon_type` (Rifle/Sniper/Shotgun/Pistol…), `sub_type`, `size`

### `fps_armour` (1,779 rows)
Source: `DataCore/entities/scitem/characters/human/armor/pu_armor/` (excludes `s42_armor`)

Additional columns: `type` (Char_Armor_Arms/Torso/Helmet/Legs/Undersuit/Backpack/Core), `sub_type`, `size`, `grade`

### `fps_attachments` (488 rows)
Source: `DataCore/entities/scitem/weapons/weapon_modifier/`

Additional columns: `type` (Optics/Magazine/Barrel/Underbarrel…), `sub_type`

### `fps_utilities` (50 rows)
Source: 4 dirs — consumables, fps_devices, throwable, mines (deduplicated by UUID)

Additional columns: `type` (Grenade/Gadget/Tool/Consumable), `sub_type`

### `fps_helmets` (614 rows) — migration 0019
Source: `DataCore/entities/scitem/characters/human/starwear/helmet/`

Additional columns: `sub_type` (Light/Medium/Heavy), `size`, `grade`

### `fps_clothing` (1,785 rows) — migration 0021
Source: `DataCore/entities/scitem/characters/human/pu_clothing/` + `pu_bespoke/` (excludes `s42_clothing`)
**No purchasability filter** — includes loot-only items for `loot_map` FK matching.

Additional columns: `slot` (Hat/Feet/Hands/Legs/Torso_0/Torso_1/Torso_2/Backpack), `size`, `grade`

---

## Consumables & Harvestables

### `consumables` (206 rows) — migration 0023
Source: `DataCore/entities/scitem/carryables/1h/`
Filter: `AttachDef.Type` in `{Food, Drink}`

| Column | Notes |
|--------|-------|
| `type` | "Food" \| "Drink" |
| `sub_type` | Bottle/Can/Bar/Sachet… NULL if UNDEFINED |

### `harvestables` (77 rows) — migration 0025
Includes 1h + 2h + tractorbeamonly items (e.g., Irradiated Apex Fang, TBO Yormandi Tongue).

### `props` (246 rows) — migration 0027
Misc props: plushies, medals, artifacts, collectibles.

---

## Loot System

### `loot_map` (5,218 rows) — migrations 0018–0028

Master loot list. Each row represents one loot-able item in the SC universe with source location data and FK cross-references to the actual item tables.

**FK columns (each added in a separate migration):**

| Column | Migration | Links To |
|--------|-----------|---------|
| `vehicle_component_id` | 0018 | `vehicle_components` |
| `fps_weapon_id` | 0018 | `fps_weapons` |
| `fps_armour_id` | 0018 | `fps_armour` |
| `fps_attachment_id` | 0018 | `fps_attachments` |
| `fps_utility_id` | 0018 | `fps_utilities` |
| `fps_helmet_id` | 0020 | `fps_helmets` |
| `fps_clothing_id` | 0022 | `fps_clothing` |
| `consumable_id` | 0024 | `consumables` |
| `harvestable_id` | 0026 | `harvestables` |
| `props_id` | 0028 | `props` |

**Source location columns (JSON arrays):**
`containers_json`, `npcs_json`, `shops_json`, `corpses_json`, `contracts_json`

**Coverage:** 4,829/5,218 (92.5%) items have at least one FK match.

**Unmatched (7.5%):** NOITEM_Vehicle (48), no-type (47), UNDEFINED (39), Char_Skin_Color (38), Missile/Missile (19), eyewear (~22), Char_Armor_Undersuit (9), misc.

**D1 UPSERT FK subquery bug:** Subquery-resolved FKs in ON CONFLICT DO UPDATE don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:
```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

---

## User Data

### `user_fleet`
**No UNIQUE constraint** — users can own multiple identical ships (two PTVs, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | TEXT NOT NULL | Better Auth user ID (no FK — auth manages) |
| `vehicle_id` | INTEGER → vehicles | |
| `custom_name` | TEXT | User ship name (Jean-Luc = Carrack) |
| `insurance_type_id` | INTEGER → insurance_types | |
| `warbond` | INTEGER DEFAULT 0 | 1 = warbond pledge |
| `is_loaner` | INTEGER DEFAULT 0 | 1 = loaner ship |
| `pledge_id` | TEXT | HangarXplor pledge identifier |
| `pledge_name` | TEXT | Original pledge store name |
| `pledge_cost` | REAL | USD paid |
| `pledge_date` | TEXT | ISO 8601 purchase date |
| `org_visibility` | TEXT DEFAULT 'private' | 'public'\|'org'\|'officers'\|'private' |
| `available_for_ops` | INTEGER DEFAULT 0 | 1 = available for org operations |
| `equipped_paint_id` | INTEGER → paints | |
| `imported_at` | TEXT | Timestamp of HangarXplor import |

**Indexes:** `idx_user_fleet_user_id`, `idx_user_fleet_vehicle_id`

---

## Out-of-Band Columns

Applied via `wrangler d1 execute`, not in any migration file. Exist in production D1 but not in the `.sql` migration sequence.

| Column | Table | Content |
|--------|-------|---------|
| `stats_json` | `vehicle_components` | DataCore component stats |
| `stats_json` | `fps_weapons` | Fire rate, ammo, damage |
| `stats_json` | `fps_armour` | Defense, temperature resistance |
| `stats_json` | `fps_attachments` | Zoom, sound suppression |
| `stats_json` | `fps_utilities` | Damage, blast radius, fuse time |
| `price_auec` | `vehicles` | aUEC in-game price |
| `acquisition_type` | `vehicles` | ingame_shop/ingame_quest/ingame_cz/pledge |
| `acquisition_source_name` | `vehicles` | Source location name |

When writing new migrations, document any new out-of-band columns in the session journal.

---

## Key Conventions

- **PK:** Always `id INTEGER PRIMARY KEY AUTOINCREMENT` — never UUID as PK
- **UUID:** Separate `uuid TEXT NOT NULL UNIQUE` when the entity has a game-side UUID
- **FK naming:** `{singular_table}_id` — e.g., `manufacturer_id`, `vehicle_id`
- **Junction tables:** Alphabetical — `paint_vehicles`, not `vehicle_paints`
- **JSON blobs:** `{field}_json` suffix — `stats_json`, `containers_json`
- **Booleans:** `INTEGER DEFAULT 0`
- **Timestamps:** `TEXT DEFAULT (datetime('now'))`
- **Index naming:** `idx_{table}_{column}`
- **Migration files:** `NNNN_description.sql`, zero-padded 4-digit, never skip or rename applied

**Better Auth tables** (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) use **camelCase** column names — this is Better Auth's convention, not ours.
