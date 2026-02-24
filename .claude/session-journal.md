# Session Journal

This file maintains running context across compactions.

## Current Focus

**Plane project fully populated. 35 work items across 8 modules (epics) — all Done state.**

## Recent Changes

- Plane MCP `create_work_item` tool returns 404 (bug in MCP server) — worked around via direct REST API
- Created 35 work items across 8 epics covering all 119 git commits, added to modules via API
- All items set to Done state, with GitHub commit links in descriptions
- Magic link callbackURL fixed to `/` (dashboard) — deployed and verified working

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- All DB timestamps are UTC — frontend converts via user timezone preference
- Always use `CLOUDFLARE_API_TOKEN`. Always use `npx wrangler`
- Plane MCP work item tool broken — use `curl` with API key `plane_api_415f2e8ef69c4869978c718724d1ae38`, workspace `nerdz`, base `https://plane.nerdz.cloud`
- Plane project ID: `a2905f67-2c5b-4f47-8fb5-cdcdc43b8890`, Done state: `9aa83223-3187-4006-a2f8-0a7d9f7c1b23`

## What's Next

- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
- **Verify ban sync in production** — `SELECT banned, status FROM user WHERE id = ?`
- **Next feature** — to be determined

---
**Session compacted at:** 2026-02-23 20:46:45


---
**Session compacted at:** 2026-02-23 20:54:20


---
**Session compacted at:** 2026-02-23 21:05:30


---
**Session compacted at:** 2026-02-23 21:09:47


---
**Session compacted at:** 2026-02-24 06:06:20


---
**Session compacted at:** 2026-02-24 06:14:36


---
**Session compacted at:** 2026-02-24 06:22:12


---
**Session compacted at:** 2026-02-24 06:22:44


---
**Session compacted at:** 2026-02-24 06:35:39


---
**Session compacted at:** 2026-02-24 06:38:23


---
**Session compacted at:** 2026-02-24 06:44:05


---
**Session compacted at:** 2026-02-24 07:15:55


---
**Session compacted at:** 2026-02-24 07:32:24


---
**Session compacted at:** 2026-02-24 10:04:05


---
**Session compacted at:** 2026-02-24 11:09:54


---
**Session compacted at:** 2026-02-24 12:08:32


---
**Session compacted at:** 2026-02-24 15:22:37


---
**Session compacted at:** 2026-02-24 15:48:53


---
**Session compacted at:** 2026-02-24 15:49:29


---
**Session compacted at:** 2026-02-24 15:50:24


---
**Session compacted at:** 2026-02-24 15:51:20


---
**Session compacted at:** 2026-02-24 15:52:26


---
**Session compacted at:** 2026-02-24 16:04:02

