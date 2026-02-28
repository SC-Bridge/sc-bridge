# Session Journal

This file maintains running context across compactions.

## Current Focus

**Plan complete: loot_map imported, components renamed, DB conventions written.**

## Recent Changes

- **Migration 0017**: `ALTER TABLE components RENAME TO vehicle_components` — applied
- **Migration 0018**: `CREATE TABLE loot_map` — applied (FKs to all item tables, JSON blob columns)
- **loot_map.json imported**: 5218 items → D1 (27 batches × 200 via `scbridge/tools/scripts/loot_map/`)
- **FK match rate**: 2269/5218 (43.5%); gaps are clothing (1787), helmets (491), misc harvestables
- **src/db/CONVENTIONS.md**: DB conventions written; CLAUDE.md rewritten to reflect TypeScript/Worker architecture
- **queries.ts + scwiki.ts**: `buildUpsertComponentStatement` → `buildUpsertVehicleComponentStatement`

## Key Decisions

- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- **Image priority**: CF Images > RSI new CDN > RSI old CDN > SC Wiki relative path > NULL
- **Plane projects**: TWO workspaces — `sc-companion` workspace, project `a9de8845` is CORRECT
- **Plane MCP bug**: MCP tools return 404 — use direct Python/curl with browser-like headers (Cloudflare WAF error 1010). API key: `plane_api_415f2e8ef69c4869978c718724d1ae38`

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (40 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0018_loot_map.sql**

| # | Migration | What |
|---|-----------|------|
| 0016 | correct_production_statuses | Production status data corrections |
| 0017 | rename_components | `components` → `vehicle_components` |
| 0018 | loot_map | `loot_map` table + FK cross-references |

**Out-of-band columns** (applied via wrangler execute, not in migration files):
- `vehicle_components.stats_json`, `fps_weapons.stats_json`, `fps_armour.stats_json`
- `fps_attachments.stats_json`, `fps_utilities.stats_json`
- `vehicles.price_auec`, `vehicles.acquisition_type`

## Applied DB State (SC 4.6.0)

- **vehicles**: 303 ships, all with CF Images IDs (`imagedelivery.net`)
- **production_status_id**: 269 flight_ready / 23 in_production / 9 in_concept
- **price_auec**: 48 ships (84,853 aUEC Dragonfly → 57,637,172 aUEC Reclaimer)
- **acquisition_type**: 34 ingame_quest / 13 ingame_cz / 48 ingame_shop / 214 NULL
- **vehicle_components**: 2045 rows (ship components from DataCore + SC Wiki)
- **fps_weapons**: 404 total; **fps_armour**: 1779; **fps_attachments**: 488; **fps_utilities**: 50
- **loot_map**: 5218 items, 2269 with FK matches

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir | What | Source |
|------------|------|--------|
| `ship_production_status/` | `production_status_id` | Extracted DataCore entity files |
| `auec_prices/` | `price_auec` | Raw `Data.p4k` via scdatatools (python3.10) |
| `acquisition_types/` | `acquisition_type` | Extracted contract + CZ JSONs |
| `loot_map/` | `loot_map` table (5218 items) | `Resolved/loot_map.json` |
| `lib/datacore.py` | Shared helpers | — |
| `ship_components_core/` | Power/cooler/shield/QD | DataCore ship component dirs |
| `ship_weapons/` | Ship guns | DataCore weapon dirs |
| `ship_missiles/` | Missile racks | DataCore missile dirs |
| `ship_misc/` | Countermeasures/QED/jumpdrive | Multiple DataCore dirs |
| `fps_weapons/` | FPS personal weapons | DataCore fps_weapons dir |
| `fps_armour/` | PU armour | DataCore pu_armor dir |
| `fps_attachments/` | Weapon modifiers | DataCore weapon_modifier dir |
| `fps_utilities/` | Consumables/grenades | Multiple consumable dirs |

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

## What's Next

- **loot_map gap coverage**: add `fps_helmets` table (491 Char_Armor_Helmet unmatched), `fps_clothing` (1787 unmatched)
- **Expose DataCore data** — ship component stats in API/UI
- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-28 18:41:13

