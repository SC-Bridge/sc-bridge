# Session Journal

This file maintains running context across compactions.

## Current Focus

**Ship images — RSI sync enabled, deploying now. Will build slug map after sync runs.**

## Recent Changes

- Logo/favicon: SC Bridge PNG added, all sizes generated, sidebar Rocket → logo — `718a063`
- Enabled RSI_API_ENABLED=true in wrangler.toml — RSI image sync was silently no-oping every night — `c44391d`
- Admin page with all sync buttons already existed at `/admin` (no code needed)

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
- Plane MCP work item tool broken — use `curl` with API key `plane_api_415f2e8ef69c4869978c718724d1ae38`, workspace `nerdz`, base `https://plane.nerdz.cloud`
- Plane project ID: `a2905f67-2c5b-4f47-8fb5-cdcdc43b8890`, Done state: `9aa83223-3187-4006-a2f8-0a7d9f7c1b23`

## What's Next

- **Trigger RSI sync** from /admin after deploy
- **Expand shipNameMap** in src/sync/rsi.ts for skipped ships
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
