# Session Journal

This file maintains running context across compactions.

## Current Focus

**FleetYards removed. Codebase cleaned up. Account page crash fixed.**

## Recent Changes

- **`formatDate` / `formatDateOnly` fixed** (`frontend/src/lib/dates.js`) — Better Auth returns `Date` objects and numbers, not strings. Added `instanceof Date` + `typeof number` guards before `.trim()` call. Fixes Account page blank/crash.
- **FleetYards integration removed entirely** (commit `edaf0b2`) — 10 files changed, `src/sync/fleetyards.ts` deleted (253 lines). Production DB confirmed all paint `image_url` values were already RSI CDN — FY was fully redundant.
- **Sync pipeline simplified**: SC Wiki → scunpacked → RSI (4 cron triggers, was 5). `15 3 * * *` slot removed from `wrangler.toml`.
- **Review nits applied** (commit `a5a8bdb`) — comment on `rsiGraphql` suffix assumption in `queries.ts`, ms-timestamp comment in `dates.js`, `App.jsx` ErrorBoundary/Suspense/Routes indentation fixed.

## Key Decisions

- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- parent_vehicle_id fallback: special editions → base ship's vehicle_images entry
- **RSI CDN URL relationship confirmed:** mediaID links all 3 formats; token = Base58(old source URL); hash = HMAC-SHA1(RSI_PRIVATE_KEY) — cannot be derived (RSI "image-composer" service on AWS CloudFront)
- Old CDN (`media.rsi.com`) = Google Cloud Storage; New CDN = AWS CloudFront + proprietary image-composer
- **Plane projects**: TWO workspaces — `nerdz` workspace has project `a2905f67` ("SC Bridge", wrong one accidentally updated); `sc-companion` workspace has project `a9de8845` (CORRECT SC Bridge project, URL: `https://plane.nerdz.cloud/sc-companion/projects/a9de8845-bec9-4197-bab0-d065bc75a709/issues/`)
- **Plane MCP bug:** MCP `update_work_item`/`retrieve_work_item`/`list_work_items` return 404 — use direct Python/curl with browser-like headers (`Origin`, `Referer`, `User-Agent`) to bypass Cloudflare WAF (error 1010)
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


---
**Session compacted at:** 2026-02-27 08:08:11


---
**Session compacted at:** 2026-02-27 08:53:00


---
**Session compacted at:** 2026-02-27 10:11:32


---
**Session compacted at:** 2026-02-27 11:33:53


---
**Session compacted at:** 2026-02-27 12:39:10


---
**Session compacted at:** 2026-02-27 12:45:31


---
**Session compacted at:** 2026-02-27 13:06:33


---
**Session compacted at:** 2026-02-27 13:14:55

