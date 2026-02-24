# Session Journal

This file maintains running context across compactions.

## Current Focus

**Organisation System fully implemented (all 7 sprints). Needs production deployment + D1 migrations.**

## Recent Changes

- `src/lib/auth.ts` — `organization()` plugin added with additionalFields (rsiSid, social links) + `sendInvitationEmail` (URL constructed from `data.invitation.id`, not `data.invitationUrl` which doesn't exist)
- `src/routes/orgs.ts` (NEW) — full org CRUD: list, profile, fleet (visibility-gated), members, analysis, stats
- `src/routes/fleet.ts` — added `org_visibility` + `available_for_ops` to fleet SELECT; added `PATCH /:id/visibility`
- `frontend/src/pages/Orgs.jsx` (NEW), `OrgProfile.jsx` (NEW), `AcceptInvitation.jsx` (NEW)
- `frontend/src/pages/FleetTable.jsx` — per-ship visibility dropdown + ops checkbox (shown when user is in ≥1 org)
- `frontend/src/pages/Account.jsx` — RSI handle sync, profile display, RsiOrgChip
- Committed Sprint 1-4 as `8fea4c4`, Sprint 5-6 as `3cb4d0d`
- Plane Epic 9 (RSI Profile) + Epic 10 (Organisations) — 20 work items, all Done

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

