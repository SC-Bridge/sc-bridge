# Session Journal

This file maintains running context across compactions.

## Supplimentary Repo

All tools/scripts/extractors which are propriatary are stored in a private repo which can be found locally here: /home/gavin/scbridge

## Current Focus

POI feature (Epic #9, Issues #14–20) — **COMPLETE**, pending deploy.

## Recent Changes

- **POI feature** (Epic #9): Full implementation of Points of Interest — "what drops at Location X?"
  - Backend: `getLootByLocation()` in `queries.ts` + `GET /api/loot/by-location` in `loot.ts`. JS aggregation on Worker (not D1 json_each).
  - Frontend: `POI.jsx` (directory page, 3 tabs: containers/shops/NPCs, group filters, search), `POIDetail.jsx` (detail page, items grouped by category, rarity badges, drop rates)
  - Routes: `/poi`, `/poi/:slug`, `/poi/shop/:slug`, `/poi/npc/:slug`, `/loot/:uuid` deep link
  - LootDB: Auto-open detail panel via `/loot/:uuid` route param. Location chips link to `/poi/` pages.
  - Nav: "Locations" item with MapPin icon added after "Item Finder"
- **Analysis fix** (#33): Multi-term role matching for gap detection, chart axis fixes, duplicate bar fix

## Key Decisions

- **Hono Workers routing gotcha**: `app.on()` / `app.get()` route wildcards (`*`, `**`) do NOT match multi-segment paths in CF Workers v8 runtime (works fine in Node.js). Use `app.use()` middleware wildcards for any multi-segment wildcard matching.
- **CF edge cache vs Workers Assets CDN**: "Purge Everything" clears CF edge cache but NOT internal Workers Assets CDN cache. `run_worker_first = true` routes all requests through Worker before Assets CDN.
- **Vite+Wrangler deploy order**: MUST `npm run build` then `wrangler deploy`. `wrangler deploy` alone uses cached `dist/sc_bridge/` — new routes added after last build will be missing from deployed Worker.
- **Loot filtering**: Client-side only — fetch all 5218 items once (~1.3MB), filter in browser for instant UX. Server pagination would break search-as-you-type.
- **Hono generic typing**: `lootRoutes()` uses `Hono<HonoEnv>` directly (NOT `<E extends HonoEnv>` generic) — generic context breaks `c.get('user')` and `c.env.DB` type inference.
- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (46 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0043_manufacturers_class.sql** (0044 committed, not yet applied)

| #    | Migration               | What                                                              |
| ---- | ----------------------- | ----------------------------------------------------------------- |
| 0017 | rename_components       | `components` → `vehicle_components`                              |
| 0018 | loot_map                | `loot_map` table + FK cross-references                           |
| 0019 | fps_helmets             | Helmet table                                                      |
| 0020 | loot_map_helmet_fk      | `fps_helmet_id` on loot_map                                       |
| 0021 | fps_clothing            | Clothing table (slot-based)                                       |
| 0022 | loot_map_clothing_fk    | `fps_clothing_id` on loot_map                                     |
| 0023 | consumables             | Food/Drink table                                                  |
| 0024 | loot_map_consumable_fk  | `consumable_id` on loot_map                                       |
| 0025 | harvestables            | Harvestable items table                                           |
| 0026 | loot_map_harvestable_fk | `harvestable_id` on loot_map                                      |
| 0027 | props                   | Props table (plushies, medals, artifacts)                         |
| 0028 | loot_map_props_fk       | `props_id` on loot_map                                            |
| 0035 | contracts               | `contracts` table + seed data (81 rows)                           |
| 0036 | user_loot_collection    | `user_loot_collection` table + indexes                            |
| 0037 | patch_versioning        | `game_versions` table; 14 tables rebuilt with composite unique keys; seeded `4.6.0-live.11319298` |
| 0038 | user_loot_wishlist      | `user_loot_wishlist` table + indexes                              |
| 0039 | loot_quantity           | `quantity` column on `user_loot_collection` + `user_loot_wishlist` |
| 0040 | fix_collection_fk       | Rebuild `user_loot_collection` — FK was pointing to dropped `loot_map_old` |

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
| `ship_thrusters/`         | Thruster stats_json UPDATE (UPDATEs existing rows) | DataCore ships/thrusters dir                 |

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:

```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## Open Issues (GitHub) — validated 2026-03-03

### Bugs
| # | Title | Notes |
|---|-------|-------|
| 32 | INSURANCE TRACKER Mobile | `grid-cols-3` no responsive breakpoint, `shrink-0` overflow on rows. CSS fix. |

### Enhancements
| # | Title | Notes |
|---|-------|-------|
| 31 | CF Images upload pipeline for paints | No CF Images support for paints yet. Needs migration, sync guard, upload pipeline. |
| 30 | Org settings page | Read-only display works. Needs PATCH endpoint + settings form. |
| 10 | Paint browser | Backend 100% done (API, junction table, types). Frontend page needed (~200-300 LOC). |

### POI Feature (epic #9, area: loot) — #14–20, ALL COMPLETE
Implemented in single commit. Backend aggregation + 2 new pages + deep linking + nav.

## What's Next

- **Bug**: #32 (Insurance Mobile) — quick CSS fix
- **Paint browser** (#10) — backend done, frontend only
- **Org Settings** (#30) — backend + frontend
- **CF Images for paints** (#31) — larger pipeline work

## Recently Closed (this session)

- #33 — Fleet Analysis "no ships detected" (fixed in e19760c)
- #11 — Item stats for helmets/clothing/attachments (done)
- #12 — Org settings (duplicate of #30)
- #13 — Shopping list friendly names (done via lootLocations.js)
- #24 — fps_clothing stats_json (won't-do, cosmetic only)
- #26 — fps_utilities stats_json (done, script existed and ran)
- Loot unmatched items — 0 visible in UI

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

**Session compacted at:** 2026-03-03 15:26:23


---
**Session compacted at:** 2026-03-03 16:06:05


---
**Session compacted at:** 2026-03-03 16:21:45


---
**Session compacted at:** 2026-03-03 16:27:32


---
**Session compacted at:** 2026-03-03 17:11:54


---
**Session compacted at:** 2026-03-03 17:17:59


---
**Session compacted at:** 2026-03-03 17:35:47


---
**Session compacted at:** 2026-03-03 18:06:52


---
**Session compacted at:** 2026-03-03 19:40:30


---
**Session compacted at:** 2026-03-03 19:40:37


---
**Session compacted at:** 2026-03-03 19:45:04


---
**Session compacted at:** 2026-03-03 20:18:41


---
**Session compacted at:** 2026-03-03 20:19:33

