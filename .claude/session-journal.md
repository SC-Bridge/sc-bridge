# Session Journal

This file maintains running context across compactions.

## Current Focus

**ShipDetail loadout display complete** — type name + index hardpoint labels, dedicated Size column, structural ports hidden, no duplicate weapon rows.

## Recent Changes

- **Port size backfill** (`ship_ports/extract_sizes.py`): Parsed 126 ship XMLs → 9712 UPDATEs for size_min/size_max; 612 `$uneditable` structural ports cleared (editable=0, port_type/category_label NULL)
- **Duplicate weapon fix** (`src/db/queries.ts`): `getShipLoadout` WHERE excludes child ports whose parent has the same category_label
- **Loadout display** (`frontend/src/pages/ShipDetail.jsx`): Hardpoint column shows `category_label` (or `category_label 0 / 1` when multiple); Size column (`S{n}`) restored left of Grade. `TYPE_PREFIXES`/`formatPortName` removed.
- All deployed: last commit d4c20ce

## Key Decisions

- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- **Image priority**: CF Images > RSI new CDN > RSI old CDN > SC Wiki relative path > NULL
- **Plane projects**: TWO workspaces — `sc-companion` workspace, project `a9de8845` is CORRECT
- **Plane MCP bug**: MCP tools return 404 — use direct Python/curl with browser-like headers (Cloudflare WAF error 1010). API key: `plane_api_415f2e8ef69c4869978c718724d1ae38`

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (46 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0034_vehicle_ports_backfill2.sql**

| # | Migration | What |
|---|-----------|------|
| 0017 | rename_components | `components` → `vehicle_components` |
| 0018 | loot_map | `loot_map` table + FK cross-references |
| 0019 | fps_helmets | Helmet table |
| 0020 | loot_map_helmet_fk | `fps_helmet_id` on loot_map |
| 0021 | fps_clothing | Clothing table (slot-based) |
| 0022 | loot_map_clothing_fk | `fps_clothing_id` on loot_map |
| 0023 | consumables | Food/Drink table |
| 0024 | loot_map_consumable_fk | `consumable_id` on loot_map |
| 0025 | harvestables | Harvestable items table |
| 0026 | loot_map_harvestable_fk | `harvestable_id` on loot_map |
| 0027 | props | Props table (plushies, medals, artifacts) |
| 0028 | loot_map_props_fk | `props_id` on loot_map |

**Out-of-band columns** (applied via wrangler execute, not in migration files):
- `vehicle_components.stats_json`, `fps_weapons.stats_json`, `fps_armour.stats_json`
- `fps_attachments.stats_json`, `fps_utilities.stats_json`
- `vehicles.price_auec`, `vehicles.acquisition_type`

## Applied DB State (SC 4.6.0)

- **vehicles**: 303 ships, all with CF Images IDs (`imagedelivery.net`)
- **vehicle_ports**: 25,797 rows (player ships only, INSERT...SELECT skips AI variants)
- **vehicle_components**: 2080 rows (ship components + mining modules + 9 salvage attachments)
- **fps_weapons**: 404; **fps_armour**: 1779; **fps_attachments**: 488; **fps_utilities**: 50
- **fps_helmets**: 614; **fps_clothing**: 1785 (includes loot-only); **consumables**: 206
- **harvestables**: 77 (1h + 2h + tractorbeamonly — incl. Irradiated Apex Fang, TBO Yormandi Tongue); **props**: 246
- **loot_map**: 5218 items, **4829 with FK matches (92.5%)**

Remaining 389 unmatched (7.5%): NOITEM_Vehicle (48), no-type (47), UNDEFINED (39),
Char_Skin_Color (38), placeholder Usable (29), Missile/Missile (19), Char_Head_Hair (19),
eyewear (~22), Char_Armor_Undersuit (9), Char_Armor_Helmet/Helmet (9), misc others.

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir | What | Source |
|------------|------|--------|
| `ship_production_status/` | `production_status_id` | DataCore entity files |
| `auec_prices/` | `price_auec` | Raw `Data.p4k` via scdatatools (python3.10) |
| `acquisition_types/` | `acquisition_type` | Contract + CZ JSONs |
| `loot_map/` | `loot_map` table (5218 items) | `Resolved/loot_map.json` |
| `lib/datacore.py` | Shared helpers | — |
| `ship_components_core/` | Power/cooler/shield/QD | DataCore ship component dirs |
| `ship_weapons/` | Ship guns | DataCore weapon dirs |
| `ship_missiles/` | Missile racks | DataCore missile dirs |
| `ship_misc/` | Countermeasures/QED/jumpdrive | Multiple DataCore dirs |
| `ship_mining/` | Mining modules → vehicle_components | DataCore miningarm dir |
| `fps_weapons/` | FPS personal weapons | DataCore fps_weapons dir |
| `fps_armour/` | PU armour | DataCore pu_armor dir |
| `fps_attachments/` | Weapon modifiers | DataCore weapon_modifier dir |
| `fps_utilities/` | Consumables/grenades | Multiple consumable dirs |
| `fps_helmets/` | Helmets | DataCore starwear/helmet dir |
| `fps_clothing/` | Clothing (all, incl. loot-only) | DataCore pu_clothing + pu_bespoke |
| `consumables/` | Food & Drink | DataCore carryables/1h |
| `harvestables/` | Harvestable items | DataCore carryables/1h + 2h |
| `props/` | Misc props (Misc/* types) | DataCore carryables/1h + 2h |
| `ship_salvage/` | SalvageHead + SalvageModifier → vehicle_components | DataCore ships/utility/salvage |
| `ship_ports/` | Ship ports + default loadout → vehicle_ports | DataCore spaceships JSONs |
| `ship_performance/` | Flight stats (boost, angular vel, fuel, thrusters) | DataCore controller/fueltank/spaceship JSONs |

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:
```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## What's Next

- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
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

