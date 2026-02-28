# Session Journal

This file maintains running context across compactions.

## Current Focus

**ShipDB card UI polish complete and pushed.**

## Recent Changes

- **ShipDB card UI overhaul** (`frontend/src/pages/ShipDB.jsx`):
  - Uniform card height: fixed `h-14 overflow-hidden` name area, `line-clamp-2`, `min-h-[1rem]` quest row always reserved
  - Quest acquisition: "Quest Reward" label where price would be; source name on separate left-aligned row below status
  - Prices: pledge shows `$X USD`, aUEC shows `X aUEC`, pipe separator `|` when both present
  - Status badges: `in_concept` → Lightbulb + `text-blue-400`; `in_production` → Wrench + `text-sc-warn` + "In Production"
  - Stat labels (Role/Cargo/Crew): `font-semibold text-sc-accent2` to differentiate from `text-gray-400` values
  - Pagination: first/last page buttons (ChevronsLeft/Right), page jump text input (`inputMode="numeric"`)
  - Scroll-to-top: `useEffect` on `[page]` with `isMounted` ref, `window.scrollTo(0, 0)` (instant, not smooth)

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

Last applied: **0028_loot_map_props_fk.sql**

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
- **vehicle_components**: 2045 rows (ship components + mining modules)
- **fps_weapons**: 404; **fps_armour**: 1779; **fps_attachments**: 488; **fps_utilities**: 50
- **fps_helmets**: 614; **fps_clothing**: 1785 (includes loot-only); **consumables**: 206
- **harvestables**: 77 (1h + 2h + tractorbeamonly — incl. Irradiated Apex Fang, TBO Yormandi Tongue); **props**: 246
- **vehicle_components**: 2080 (incl. 9 salvage attachments)
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

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:
```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## What's Next

- **Expose DataCore data** — ship component stats in API/UI
- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
- **loot_map remaining gaps** (optional): Char_Armor_Undersuit (9), eyewear (22), Missile/Missile (19) — diminishing returns at 92.2%

---
**Session compacted at:** 2026-02-28 18:41:13


---
**Session compacted at:** 2026-02-28 19:07:20

---
**Session compacted at:** 2026-02-28 19:31:12


---
**Session compacted at:** 2026-02-28 21:10:03


---
**Session compacted at:** 2026-03-01 06:58:22

