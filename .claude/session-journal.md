# Session Journal

This file maintains running context across compactions.

## Current Focus

**Ship images complete — 268/268 coverage. Awaiting phase 2 from user.**

## Recent Changes

- `ship_images` table created (migration 0007) — tracks rsi_cdn_new, rsi_cdn_old, rsi_graphql per vehicle
- `parent_vehicle_id` added to vehicles — special editions inherit base ship image
- Populated: 195 rows in ship_images (store extract → rsi_cdn_new; HAR GraphQL → rsi_cdn_old + rsi_graphql)
- 57 special editions linked via parent_vehicle_id to their base ship — commit `ca97bb6`
- Result: 268/268 ships have images (100% coverage, all new `/i/` format or media.rsi.com fallback)

## Key Decisions

- `ship_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- parent_vehicle_id fallback: special editions (Wikelo, PYAM Exec, Teach's) → base ship's ship_images entry
- HAR (`robertsspaceindustries.com_Archive [26-02-26 23-09-46].har`) — 235 ships upgrade GraphQL, adds old-format URLs
- Store extract (`extract-data-2026-02-26.json`) — 246 ships, new `/i/` format, primary source
- **Plane workspace:** `sc-companion` (NOT `nerdz`), project ID: `a9de8845-bec9-4197-bab0-d065bc75a709`, Done state: `d5c58bec-23e0-42c4-96ca-38e3356d5733`
- Plane API key: `plane_api_415f2e8ef69c4869978c718724d1ae38`, base: `https://plane.nerdz.cloud`

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`

## Key Decisions (Auth/Infra)

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth org tables use camelCase column names in D1: `organizationId`, `userId`, `createdAt`
- `org_visibility` values: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Discord Exporter (home-ops)

- **Deployed:** `discord-exporter` CronJob in `home-automation` namespace — `home-ops` commits `0c436c0`, `1f56a75`, `e627ca0`
- **Runs:** Weekly Sunday 03:00; manual trigger: `kubectl create job -n home-automation --from=cronjob/discord-exporter <name>`
- **Output:** NFS at `citadel.internal:/mnt/storage0/discord-exports` (chmod 777, owned apps:apps)
- **Token:** Personal Discord user token (NOT bot token, NOT "Bearer" prefix) — 1Password item `discord-exporter`, field `DISCORD_TOKEN`
- **Guild:** StarFab/scdatatools community — ID `710322530992390177`; 444 files / 14MB exported including forum threads (`--include-threads all`)
- **Forbidden channels:** Admin channels + `asset-creation` — no access, expected

## What's Next

- **Phase 2** (TBD by user — ships are done, image infra is in place)
- **Paint images** — use CDN picker at `/admin/cdn-images` for paints.json
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-24 19:57:21

---
**Session compacted at:** 2026-02-24 20:40:52


---
**Session compacted at:** 2026-02-25 14:59:37


---
**Session compacted at:** 2026-02-26 11:40:48


---
**Session compacted at:** 2026-02-26 23:11:34

