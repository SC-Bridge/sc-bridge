# Session Journal

This file maintains running context across compactions.

## Current Focus

**RSI sync enabled and deployed. Plane migration to sc-companion workspace complete.**

## Recent Changes

- Logo/favicon: SC Bridge PNG added, all sizes generated, sidebar Rocket → logo — `718a063`
- Enabled RSI_API_ENABLED=true in wrangler.toml — RSI image sync was silently no-oping every night — `c44391d`
- Plane migration: all 69 issues + 11 modules migrated from `nerdz` → `sc-companion` workspace

## Key Decisions

- RSI sync was the problem — FleetYards slug matching unreliable, RSI has name map + variant inheritance
- After deploy: go to /admin → click RSI API button → check sync history
- Next: use LLM knowledge to expand `shipNameMap` in `src/sync/rsi.ts` for any skipped ships

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain

## Key Decisions (Auth/Infra)

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth org tables use camelCase column names in D1: `organizationId`, `userId`, `createdAt`
- `org_visibility` values: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)
- **Plane workspace:** `sc-companion` (NOT `nerdz`), project ID: `a9de8845-bec9-4197-bab0-d065bc75a709`, Done state: `d5c58bec-23e0-42c4-96ca-38e3356d5733`
- Plane API key: `plane_api_415f2e8ef69c4869978c718724d1ae38`, base: `https://plane.nerdz.cloud`

## What's Next

- **Trigger RSI sync** from /admin after deploy
- **Expand shipNameMap** in src/sync/rsi.ts for skipped ships
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-24 18:53:18

