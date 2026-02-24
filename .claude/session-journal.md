# Session Journal

This file maintains running context across compactions.

## Current Focus

**ShipDB image fallbacks + status badge fixes complete. RSI sync logic improved.**

## Recent Changes

- Fixed UTC timestamp bug: SQLite `datetime('now')` → `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` in queries.ts — `babee2c`
- Fixed dates.js to normalize bare timestamps to UTC before parsing — `babee2c`
- Improved RSI sync: shipNameMap chaining after prefix stripping, variant image inheritance pass 2 — `b4d30e5`
- ShipDB: baseImageMap client-side fallback + ShipImage variant banner overlay — `b4d30e5`
- Fixed ShipDB: hide production_status badge when null (was showing "Unknown") — `774d444`
- Cleared 600i Touring bad image from D1 (hash 68f2og2gz2mdq was FleetYards mismatch) — now falls back to base 600i via baseImageMap

## Key Decisions

- 600i Touring image cleared from DB — will show base 600i image with "Variant image unavailable" banner until RSI sync correctly identifies it
- ShipImage banner uses `absolute bottom-0 inset-x-0` inside `relative overflow-hidden` — overlays ON image, does not add height
- production_status_id can be NULL in vehicles table; API join returns null; badge now hidden when null
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

## What's Next

- **Trigger RSI sync** from /admin to get Ares Inferno + other missing images
- **Expand shipNameMap** in src/sync/rsi.ts for any remaining skipped ships
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-24 19:57:21
