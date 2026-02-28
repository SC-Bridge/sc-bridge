# Session Journal

This file maintains running context across compactions.

## Current Focus

**loot_map in D1, components renamed to vehicle_components, DB conventions written.**

## Recent Changes (this session)

- **Migration 0017**: `ALTER TABLE components RENAME TO vehicle_components` — applied
- **Migration 0018**: `CREATE TABLE loot_map` — applied (FKs to all item tables, JSON blob columns)
- **loot_map.json imported**: 5218 items → D1 (27 batches × 200); 2269/5218 matched to item tables (43.5%)
- **queries.ts + scwiki.ts**: renamed `buildUpsertComponentStatement` → `buildUpsertVehicleComponentStatement`
- **4 extractor scripts updated**: `INSERT INTO components` → `INSERT INTO vehicle_components`
- **src/db/CONVENTIONS.md**: DB conventions document written (naming, PKs, FKs, JSON blobs, migrations, indexes)

## Key Decisions

- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- parent_vehicle_id fallback: special editions → base ship's vehicle_images entry
- **Plane projects**: TWO workspaces — `sc-companion` workspace, project `a9de8845` is CORRECT (`https://plane.nerdz.cloud/sc-companion/projects/a9de8845-bec9-4197-bab0-d065bc75a709/issues/`)
- **Plane MCP bug:** MCP tools return 404 — use direct Python/curl with browser-like headers to bypass Cloudflare WAF (error 1010). API key: `plane_api_415f2e8ef69c4869978c718724d1ae38`

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (39 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`

## Key Decisions (Auth/Infra)

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth org tables use camelCase column names in D1: `organizationId`, `userId`, `createdAt`
- `org_visibility` values: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir | What | Python | Source |
|------------ |------|--------|--------|
| `ship_production_status/` | `production_status_id` | stdlib | Extracted dir (DataCore entity files) |
| `auec_prices/` | `price_auec` | scdatatools + ZIP64 patch | Raw `Data.p4k` (ShopInventories JSON) |
| `acquisition_types/` | `acquisition_type` | stdlib | Extracted dir (contract + CZ JSONs) |
| `loot_map/` | `loot_map.json` (5,248 items) | stdlib + StarBreaker CLI | Raw `Data.p4k` (full extraction) |
| `lib/datacore.py` | Shared helpers | stdlib | Used by all DataCore extractors |
| `manufacturers/` | Manufacturer names/desc | stdlib | `scitemmanufacturer/*.json` |
| `ship_components_core/` | Power/cooler/shield/QD | stdlib | `entities/scitem/ships/{type}/` |
| `ship_weapons/` | Ship guns | stdlib | `entities/scitem/ships/weapons/` |
| `ship_missiles/` | Missile racks | stdlib | `entities/scitem/ships/missile_racks/` |
| `ship_misc/` | Countermeasures/QED/jumpdrive | stdlib | Multiple ship dirs |
| `fps_weapons/` | FPS personal weapons | stdlib | `entities/scitem/weapons/fps_weapons/` |
| `fps_armour/` | PU armour (not s42) | stdlib | `characters/human/armor/pu_armor/` |
| `fps_attachments/` | Weapon modifiers | stdlib | `weapons/weapon_modifier/` |
| `fps_utilities/` | Consumables/grenades/mines | stdlib | Multiple consumable dirs |

**scdatatools ZIP64 bug:** `_RealGetContents` incorrectly subtracted 76 bytes for ZIP64 files. Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**Applied migrations:** 0016 (production status), 0017 (price_auec)

## Applied DB State (SC 4.6.0)

- **production_status_id**: 269 flight_ready / 23 in_production / 9 in_concept (protected from SC Wiki overwrite)
- **price_auec**: 48 ships (84,853 aUEC Dragonfly → 57,637,172 aUEC Reclaimer)
- **acquisition_type**: 34 ingame_quest / 13 ingame_cz / 48 ingame_shop / 214 NULL (pledge-only)
- **vehicle_components** (renamed from components): 2045 rows, DataCore ship components + SC Wiki
- **fps_weapons**: 404 total; **fps_armour**: 1779 total; **fps_attachments**: 488; **fps_utilities**: 50
- **loot_map**: 5218 items — 2269 matched to item tables (43.5%); gaps are clothing/helmets/misc
- **303/303 ships** have CF Images IDs; `vehicles.image_url*` → `imagedelivery.net`

## What's Next

- **loot_map gap coverage**: add `fps_helmets` table (Char_Armor_Helmet types — 491 unmatched), `fps_clothing` (1787 unmatched)
- **Expose DataCore data** — ship component stats in API/UI (vehicle_components, fps_weapons etc.)
- **Paint images** — CF Images upload for paints (separate endpoint needed)
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-28 14:05:00

---
**Session compacted at:** 2026-02-28 14:42:26


---
**Session compacted at:** 2026-02-28 14:43:16


---
**Session compacted at:** 2026-02-28 16:38:14


---
**Session compacted at:** 2026-02-28 17:10:20


---
**Session compacted at:** 2026-02-28 18:00:29

