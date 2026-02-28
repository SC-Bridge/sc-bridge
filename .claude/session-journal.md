# Session Journal

This file maintains running context across compactions.

## Current Focus

**Acquisition data now live in ShipDB — aUEC prices, quest names, CZ hangar.**

## Recent Changes (this session)

- **D1 migrations applied** — `acquisition_type` column (34 quest, 13 CZ, 48 shop) + `acquisition_source_name` (e.g. "Ship Recovery: Idris-P Wikelo War Special")
- **production_status_id** removed from ON CONFLICT UPDATE in both upsert functions — SC Wiki nightly sync no longer overwrites DataCore values
- **`/api/ships`** — now returns `price_auec`, `acquisition_type`, `acquisition_source_name`
- **ShipDB UI** — conditional display: aUEC (sc-melt) for shop ships, source name (sc-accent2) for quest/CZ, pledge price (sc-warn) for pledge-only; price sort fixed
- **214 pledge-only ships** with no acquisition_type (e.g. Javelin, Idris) — expected

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

**scdatatools ZIP64 bug:** `_RealGetContents` incorrectly subtracted 76 bytes for ZIP64 files. Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**Applied migrations:** 0016 (production status), 0017 (price_auec)

## Applied DB State (SC 4.6.0)

- **production_status_id**: 269 flight_ready / 23 in_production / 9 in_concept (protected from SC Wiki overwrite)
- **price_auec**: 48 ships (84,853 aUEC Dragonfly → 57,637,172 aUEC Reclaimer)
- **acquisition_type**: 34 ingame_quest / 13 ingame_cz / 48 ingame_shop / 214 NULL (pledge-only)
- **acquisition_source_name**: "Ship Recovery: {name}" for quests, "CZ Executive Hangar" for CZ
- **303/303 ships** have CF Images IDs; `vehicles.image_url*` → `imagedelivery.net`

## What's Next

- **Paint images** — CF Images upload for paints (separate endpoint needed)
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
- **Valkyrie Liberator Edition** — still no image (NULL by design); use `POST /api/admin/images/upload` if URL ever found

---
**Session compacted at:** 2026-02-28 14:05:00

---
**Session compacted at:** 2026-02-28 14:42:26


---
**Session compacted at:** 2026-02-28 14:43:16

