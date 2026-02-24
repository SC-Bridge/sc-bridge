# Session Journal

This file maintains running context across compactions.

## Current Focus

**Avatar system fully implemented, deployed, and tested. Plane Epic 11 created with 13 work items (all Done).**

## Recent Changes

- Avatar system: migration 0006, gravatar.ts, R2 bucket, 5 new endpoints, sidebar display — `1bac7bc`
- Client-side resize to 512px WebP before upload (1.5 MB PNG → 10 KB WebP, 149× reduction) — `5ea33e3`
- Plane Epic 11 — Avatar System: 13 work items created, all Done

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth `sendInvitationEmail`: `data.invitationUrl` does NOT exist in types — construct from `data.invitation.id`
- Better Auth org tables use camelCase column names in D1: `organizationId`, `userId`, `createdAt`
- `org_visibility` values: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)
- Plane MCP work item tool broken — use `curl` with API key `plane_api_415f2e8ef69c4869978c718724d1ae38`, workspace `nerdz`, base `https://plane.nerdz.cloud`
- Plane project ID: `a2905f67-2c5b-4f47-8fb5-cdcdc43b8890`, Done state: `9aa83223-3187-4006-a2f8-0a7d9f7c1b23`
- Module-issues endpoint: `POST /api/v1/workspaces/nerdz/projects/{pid}/modules/{mid}/module-issues/`

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth `sendInvitationEmail`: `data.invitationUrl` does NOT exist in types — construct from `data.invitation.id`
- Better Auth org tables use camelCase column names in D1: `organizationId`, `userId`, `createdAt`
- `org_visibility` values: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)
- Plane MCP work item tool broken — use `curl` with API key `plane_api_415f2e8ef69c4869978c718724d1ae38`, workspace `nerdz`, base `https://plane.nerdz.cloud`
- Plane project ID: `a2905f67-2c5b-4f47-8fb5-cdcdc43b8890`, Done state: `9aa83223-3187-4006-a2f8-0a7d9f7c1b23`

## What's Next

- **Deploy to production**: push to main, then `GET /api/auth/migrate` to create org/member/invitation tables
- **Run D1 migration 0005**: `user_rsi_profile` table + ALTER TABLE `user_fleet` for `org_visibility`/`available_for_ops`
- **Org Settings page** (v2): update org metadata (RSI SID, social links) — skipped from v1 scope
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-24 16:26:11

---
**Session compacted at:** 2026-02-24 16:59:13


---
**Session compacted at:** 2026-02-24 17:24:23

