# Session Journal

This file maintains running context across compactions.

## Current Focus

**Cloudflare Images CDN implemented — own the images, RSI CDN changes can't break us.**

## Recent Changes

- **Migration 0012_cf_images.sql** — Adds `cf_images_id TEXT` column to `vehicle_images`
- **src/lib/cfImages.ts** — `uploadToCFImages(accountId, token, sourceURL, metadata)` → returns `cf_images_id`
- **src/db/queries.ts** — Added `getVehiclesNeedingCFUpload(db, limit, offset)` and `setVehicleCFImagesID(db, vehicleId, cfImagesId, accountHash)`
- **src/routes/admin.ts** — `POST /api/admin/images/bulk-upload?limit=50&offset=0` (paginated, idempotent) and `POST /api/admin/images/upload` (single ship by slug + imageUrl)
- **src/index.ts** — Mounts `/api/admin/*` under `super_admin` role guard
- **src/lib/types.ts** — Added `CLOUDFLARE_IMAGES_TOKEN`, `CF_ACCOUNT_HASH`, `CF_ACCOUNT_ID` to `Env`

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

- **Deploy + run migration** — `wrangler d1 migrations apply sc-companion --remote` then set secrets + deploy
- **Run bulk-upload** — `POST /api/admin/images/bulk-upload?limit=50` repeatedly until all ships uploaded
- **Valkyrie Liberator Edition** — once source image URL found, use `POST /api/admin/images/upload`
- **Paint images** — CF Images upload for paints (separate endpoint needed)
- **Org Settings page** (v2): update org metadata (RSI SID, social links)

---
**Session compacted at:** 2026-02-27 18:53:00

---
**Session compacted at:** 2026-02-27 19:23:00

