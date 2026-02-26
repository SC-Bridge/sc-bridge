# Session Journal

This file maintains running context across compactions.

## Current Focus

**Ship images refreshed — 209/268 ships have fresh RSI store images. Paint images still to do.**

## Recent Changes

- Wiped all vehicle image_url fields — complete clean slate
- Applied `/mnt/c/Users/gavin/Downloads/extract-data-2026-02-26.json` (246 RSI store ships) → 209 matched and updated in D1
- All updated images are new `/i/` RSI CDN format at 910×512 (all 4 size columns set to same URL)
- CDN picker enhanced: shows existing D1 images alongside CDN candidates, deduplicates case-only entries — commit `6f74061`
- Added `GET /api/sync/cdn/existing` endpoint + `useCDNExistingImages` hook — commit `be1e841`

## Key Decisions

- **Ship images**: 59 ships missing images are all special editions (Wikelo specials, PYAM Exec, Teach's Specials) + ATLS color variants — not on public RSI store, expected to be imageless
- Fresh images from RSI store extract preferred over old media.rsi.com GraphQL URLs — new `/i/` format, better quality
- All 4 image_url size columns (image_url, image_url_small, image_url_medium, image_url_large) set to same URL — ShipDB uses `image_url_medium || image_url`
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

- **Paint images** — use CDN picker at `/admin/cdn-images` for paints.json; ships are done
- **ship_images table** — proposed: separate table keyed to vehicle FK, storing known slugs + URL variants (RSI_CDN_old, RSI_CDN_new, RSI_GraphQL) to get to 95%+ coverage using store extract + HAR file
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

