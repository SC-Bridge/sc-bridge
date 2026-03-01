# Session Journal

This file maintains running context across compactions.

## Supplimentary Repo

All tools/scripts/extractors which are propriatary are stored in a private repo which can be found locally here: /home/gavin/scbridge

## Current Focus

**GV ships page verified** — All 13 ground vehicle types load correctly on ships page. ROC shows cooler/power/sensor (Components) + mining arm/laser (Weapons). MTC shows shields/sensors/components + turret. Ready for next feature.

## Recent Changes

- **GV ships page verified**: `getShipLoadout` returns correct data for all GV slugs. COMPONENT_TYPES and WEAPON_TYPES in ShipDetail.jsx cover all GV port types. All 13 GVs have CF Images, proper slugs, categorized ports with sizes.
- **Ground vehicle ports** (`26a959a`): extract.py updated to scan `entities/groundvehicles`. PORT_CATEGORIES extended with GV-specific prefixes + `hardpoint_weapon_gun/class/missile` variants (fixes Avenger, Vanguard, Pisces, Merlin, Archimedes). ON CONFLICT updates `port_type`.
- **Port sizes backfill**: extract_sizes.py MANUAL_XML_MAP entries for RSI_Hermes (apollo), MDC/MTC (MXC), Ursa Medivac (ursa_rover). All GV XMLs auto-resolved via suffix-stripping. 18,455 UPDATE statements applied to D1.
- **Loot Item Finder** (`70b5905`): 5218 items, sidebar filters, grid+list, detail slide-over, auth-gated collection tracking live at `/loot`.

## Key Decisions

- **Loot filtering**: Client-side only — fetch all 5218 items once (~1.3MB), filter in browser for instant UX. Server pagination would break search-as-you-type.
- **Loot collection**: Binary `collected` toggle. `user_loot_collection` table with `UNIQUE(user_id, loot_map_id)` and `INSERT OR IGNORE`.
- **Hono generic typing**: `lootRoutes()` uses `Hono<HonoEnv>` directly (NOT `<E extends HonoEnv>` generic) — generic context breaks `c.get('user')` and `c.env.DB` type inference. Inline auth checks instead of internal middleware.
- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- **Image priority**: CF Images > RSI new CDN > RSI old CDN > SC Wiki relative path > NULL

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (46 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0036_user_loot_collection.sql**

| #    | Migration               | What                                      |
| ---- | ----------------------- | ----------------------------------------- |
| 0017 | rename_components       | `components` → `vehicle_components`       |
| 0018 | loot_map                | `loot_map` table + FK cross-references    |
| 0019 | fps_helmets             | Helmet table                              |
| 0020 | loot_map_helmet_fk      | `fps_helmet_id` on loot_map               |
| 0021 | fps_clothing            | Clothing table (slot-based)               |
| 0022 | loot_map_clothing_fk    | `fps_clothing_id` on loot_map             |
| 0023 | consumables             | Food/Drink table                          |
| 0024 | loot_map_consumable_fk  | `consumable_id` on loot_map               |
| 0025 | harvestables            | Harvestable items table                   |
| 0026 | loot_map_harvestable_fk | `harvestable_id` on loot_map              |
| 0027 | props                   | Props table (plushies, medals, artifacts) |
| 0028 | loot_map_props_fk       | `props_id` on loot_map                    |
| 0035 | contracts               | `contracts` table + seed data (81 rows)   |
| 0036 | user_loot_collection    | `user_loot_collection` table + indexes    |

**Out-of-band columns** (applied via wrangler execute, not in migration files):

- `vehicle_components.stats_json`, `fps_weapons.stats_json`, `fps_armour.stats_json`
- `fps_attachments.stats_json`, `fps_utilities.stats_json`
- `vehicles.price_auec`, `vehicles.acquisition_type`

## Applied DB State (SC 4.6.0)

- **vehicles**: 303 ships, all with CF Images IDs (`imagedelivery.net`)
- **vehicle_ports**: 27,058 rows (player ships + 13 GV types; INSERT...SELECT skips AI variants)
- **vehicle_components**: 2080 rows (ship components + mining modules + 9 salvage attachments)
- **fps_weapons**: 404; **fps_armour**: 1779; **fps_attachments**: 488; **fps_utilities**: 50
- **fps_helmets**: 614; **fps_clothing**: 1785 (includes loot-only); **consumables**: 206
- **harvestables**: 77 (1h + 2h + tractorbeamonly — incl. Irradiated Apex Fang, TBO Yormandi Tongue); **props**: 246
- **loot_map**: 5218 items, **4829 with FK matches (92.5%)**

Remaining 389 unmatched (7.5%): NOITEM_Vehicle (48), no-type (47), UNDEFINED (39),
Char_Skin_Color (38), placeholder Usable (29), Missile/Missile (19), Char_Head_Hair (19),
eyewear (~22), Char_Armor_Undersuit (9), Char_Armor_Helmet/Helmet (9), misc others.

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir                | What                                               | Source                                       |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `ship_production_status/` | `production_status_id`                             | DataCore entity files                        |
| `auec_prices/`            | `price_auec`                                       | Raw `Data.p4k` via scdatatools (python3.10)  |
| `acquisition_types/`      | `acquisition_type`                                 | Contract + CZ JSONs                          |
| `loot_map/`               | `loot_map` table (5218 items)                      | `Resolved/loot_map.json`                     |
| `lib/datacore.py`         | Shared helpers                                     | —                                            |
| `ship_components_core/`   | Power/cooler/shield/QD                             | DataCore ship component dirs                 |
| `ship_weapons/`           | Ship guns                                          | DataCore weapon dirs                         |
| `ship_missiles/`          | Missile racks                                      | DataCore missile dirs                        |
| `ship_misc/`              | Countermeasures/QED/jumpdrive                      | Multiple DataCore dirs                       |
| `ship_mining/`            | Mining modules → vehicle_components                | DataCore miningarm dir                       |
| `fps_weapons/`            | FPS personal weapons                               | DataCore fps_weapons dir                     |
| `fps_armour/`             | PU armour                                          | DataCore pu_armor dir                        |
| `fps_attachments/`        | Weapon modifiers                                   | DataCore weapon_modifier dir                 |
| `fps_utilities/`          | Consumables/grenades                               | Multiple consumable dirs                     |
| `fps_helmets/`            | Helmets                                            | DataCore starwear/helmet dir                 |
| `fps_clothing/`           | Clothing (all, incl. loot-only)                    | DataCore pu_clothing + pu_bespoke            |
| `consumables/`            | Food & Drink                                       | DataCore carryables/1h                       |
| `harvestables/`           | Harvestable items                                  | DataCore carryables/1h + 2h                  |
| `props/`                  | Misc props (Misc/\* types)                         | DataCore carryables/1h + 2h                  |
| `ship_salvage/`           | SalvageHead + SalvageModifier → vehicle_components | DataCore ships/utility/salvage               |
| `ship_ports/`             | Ship ports + default loadout → vehicle_ports       | DataCore spaceships + groundvehicles JSONs   |
| `ship_performance/`       | Flight stats (boost, angular vel, fuel, thrusters) | DataCore controller/fueltank/spaceship JSONs |

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:

```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## What's Next

- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Loot detail stats**: `GET /api/loot/:uuid` fetches FK'd item table for stats_json — could surface more item details in the slide-over panel
- **loot_map remaining gaps** (optional): Char_Armor_Undersuit (9), eyewear (22), Missile/Missile (19) — diminishing returns at 92.2%

## Weapon Mount Pattern (for future reference)

Gun ports in DataCore equip a weapon mount (fixed/gimbal bracket), not the weapon directly.
Mount UUID → `vehicle_ports.equipped_item_uuid` BUT mounts are NOT in `vehicle_components`.
The actual weapon is in a child port (`hardpoint_class_2`, `hardpoint_class_1_left`, etc.).
`getShipLoadout` uses CTE + COALESCE child-port fallback to resolve through the mount.
`_seat` is NOT safe to exclude — Mercury Star Runner `turret_top/bottom_seat` have real TurretBase components.

## Port Size / XML Pattern (for future reference)

Ship XMLs: `Extracted/XML/Data/Scripts/Entities/Vehicles/Implementations/Xml/{class_name}.xml`
Port sizes live in the XML, not in DataCore JSON. Walk `<Part name="hardpoint_*">` → `<ItemPort minSize maxSize flags>`.

- `$uneditable` flag → structural (door panel, relay) → hide (editable=0, clear port_type/category_label)
- `invisible uneditable` → internal system (e.g. radar) → KEEP showing (has real component)
- empty flags → normal player-swappable slot
- XML size_max for weapon ports = MOUNT size (e.g. S3 gimbal); `component_size` = actual weapon size (e.g. S2). Display prefers component_size, falls back to size_max for empty slots.

**XML Inheritance (MANUAL_XML_MAP):** Some ships use a different XML than their class name suggests. Verified via DataCore `vehicleDefinition` field:
- `RSI_Hermes` → `rsi_apollo.xml`; `GRIN_MDC/MTC` → `GRIN_MXC.xml`; `RSI_Ursa_Medivac*` → `RSI_Ursa_Rover.xml`
- `ARGO_ATLS` variants → NO vehicle XML (actor entity in `actor/actors/`, not `entities/vehicles/`)

**`hardpoint_weapon_gun` / `hardpoint_weapon_class` / `hardpoint_weapon_missile` prefixes** were missing from PORT_CATEGORIES — now fixed. These appear on Avenger, Vanguard, Pisces, Merlin, Archimedes.
extract.py ON CONFLICT now updates `port_type` so re-runs will fix existing rows.

---

**Session compacted at:** 2026-03-01 08:35:38

---

**Session compacted at:** 2026-03-01 09:34:37

---

**Session compacted at:** 2026-03-01 09:57:05

---

**Session compacted at:** 2026-03-01 10:56:21

---

**Session compacted at:** 2026-03-01 11:31:51

---

**Session compacted at:** 2026-03-01 13:15:27

---

**Session compacted at:** 2026-03-01 13:28:35

---

**Session compacted at:** 2026-03-01 13:28:58

---

**Session compacted at:** 2026-03-01 13:29:57

---

**Session compacted at:** 2026-03-01 13:33:40

---

**Session compacted at:** 2026-03-01 13:39:11

---

**Session compacted at:** 2026-03-01 13:39:45

---

**Session compacted at:** 2026-03-01 14:16:28

---

**Session compacted at:** 2026-03-01 14:35:10

---

**Session compacted at:** 2026-03-01 15:06:17

---

**Session compacted at:** 2026-03-01 18:29:59

---

**Session compacted at:** 2026-03-02 06:19:33

---

**Session compacted at:** 2026-03-02 06:49:36

---

**Session compacted at:** 2026-03-02 07:11:48

---

**Session compacted at:** 2026-03-02 07:58:38

---

**Session compacted at:** 2026-03-02 08:37:14

---

**Session compacted at:** 2026-03-02 08:42:12

---

**Session compacted at:** 2026-03-02 08:54:01

---

**Session compacted at:** 2026-03-02 08:54:18

---

**Session compacted at:** 2026-03-02 08:55:10

---

**Session compacted at:** 2026-03-02 09:06:17

---

**Session compacted at:** 2026-03-02 09:34:30

---
**Session compacted at:** 2026-03-02 10:10:38


---
**Session compacted at:** 2026-03-02 10:16:26


---
**Session compacted at:** 2026-03-02 10:19:16


---
**Session compacted at:** 2026-03-02 10:19:38


---
**Session compacted at:** 2026-03-02 10:19:56


---
**Session compacted at:** 2026-03-02 10:27:15


---
**Session compacted at:** 2026-03-02 10:35:55


---
**Session compacted at:** 2026-03-02 10:48:01


---
**Session compacted at:** 2026-03-02 10:51:39


---
**Session compacted at:** 2026-03-02 11:07:12


---
**Session compacted at:** 2026-03-02 11:08:07


---
**Session compacted at:** 2026-03-02 11:08:23

