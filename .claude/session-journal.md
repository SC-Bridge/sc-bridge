# Session Journal

This file maintains running context across compactions.

## Current Focus

**Loadout tab complete** — weapon mount pass-through fixed, deployed to production. Verify `/ships/gladius` shows weapon names.

## Recent Changes

- **Fixed** `extract.py` PORT_CATEGORIES: added `hardpoint_gun_rack`/`hardpoint_gunrack` as None (before `hardpoint_gun`); added `_console`, `_camera`, `_controller` to infra substring exclusions
- **Re-ran** `ship_ports/extract.py` + applied to D1: 25,797 rows, 97% of labeled ports equipped (2,383/2,460)
- **Added** migration 0030: indexes on `vehicle_ports(vehicle_id)` and `vehicle_ports(parent_port_id)`
- **Fixed** `getShipLoadout`: CTE + COALESCE child-port fallback resolves weapons through mount brackets (Gladius: CF-337 Panther Repeater, Mantis GT-220 Gatling)
- **Pushed** to main → deploying via GitHub Actions

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

Last applied: **0030_vehicle_ports_indexes.sql**

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

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:
```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## What's Next

- **Verify**: `/ships/gladius` Loadout tab in production — weapons should show named components via mount fallback
- **Re-run manufacturers** extractor to ensure manufacturer data is up to date
- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **loot_map remaining gaps** (optional): Char_Armor_Undersuit (9), eyewear (22), Missile/Missile (19) — diminishing returns at 92.2%

## Weapon Mount Pattern (for future reference)

Gun ports in DataCore equip a weapon mount (fixed/gimbal bracket), not the weapon directly.
Mount UUID → `vehicle_ports.equipped_item_uuid` BUT mounts are NOT in `vehicle_components`.
The actual weapon is in a child port (`hardpoint_class_2`, `hardpoint_class_1_left`, etc.).
`getShipLoadout` uses CTE + COALESCE child-port fallback to resolve through the mount.
`_seat` is NOT safe to exclude — Mercury Star Runner `turret_top/bottom_seat` have real TurretBase components.


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

