# Session Journal

This file maintains running context across compactions.

## Current Focus

**Large image cleanup pass complete. Power Suit removed. RSI sync pending.**

## Recent Changes

- Fixed `findVehicleSlug` in rsi.ts: shipNameMap checked BEFORE direct name match — `d0ad3e1`
- Fixed `buildImageURLs` in rsi.ts: detects `.png` extension from original URL — `d0ad3e1`
- Fixed ShipDB: hide production_status badge when null (was showing "Unknown") — `774d444`
- ShipDB pagination scroll-to-top + scwiki.ts BLOCKED_VEHICLE_SLUGS (power-suit) — `659b671`
- D1: Deleted power-suit vehicle; bulk-cleared 23 stale/404 images; set F8A Lightning→F8C hash, Idris-M→Idris-P hash, PYAM Exec→F7A Mk II hash

## Key Decisions

- Power Suit (SC Wiki slug: power-suit) — deleted from D1, blocked in scwiki.ts. Not a ship.
- F8A Lightning, Idris-M, Hornet F7A Mk II PYAM Exec: use civilian counterpart RSI images (will remain until CIG adds them to public store)
- Blade will have no image — it's a Vanduul ship not on RSI's public store; baseImageMap won't help (no base "Blade")
- Cyclone TR "cut off" look is a composition issue with the actual RSI image, not a data problem
- Dragonfly Star Kitten Edition is a valid SC Wiki stub vehicle — different entry from Dragonfly Star Kitten
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

- **Trigger RSI sync from /admin** after CI deploys — will fill in Carrack, Sabre, Gladiator, Redeemer, Ballista Dunestalker/Snowblind, M50, Nox Kue, Hawk, Dragonfly Yellowjacket, P-72 Emerald, Sabre Raven, Ares Inferno, and Hornet variants
- **Expand shipNameMap** in src/sync/rsi.ts if any ships are still skipped after sync
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
- **Read Discord export** — parse `starfab-support` and `renderer-support` forum threads for StarFab/Blender pipeline help

---
**Session compacted at:** 2026-02-24 19:57:21

---
**Session compacted at:** 2026-02-24 20:40:52


---
**Session compacted at:** 2026-02-25 14:59:37

