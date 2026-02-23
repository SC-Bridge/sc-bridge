# Session Journal

This file maintains running context across compactions.

## Current Focus

**Soft deletion + user status implemented. Migration 0004 needs applying to remote D1.**

## Recent Changes

- Migration 0004: `ALTER TABLE user ADD COLUMN status / deleted_at` + 3 new event types (17-19)
- `DELETE /api/account`: no longer hard-deletes user row — anonymises PII, sets `status='deleted'`; keeps `user_change_history` as audit trail
- `requireAuth` in `src/index.ts`: rejects non-'active' users (deleted/suspended/banned) even with valid session
- `change-history.ts`: added `account_suspended` (17), `account_banned` (18), `account_reinstated` (19) to EVENT_TYPE_IDS

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
- Grafana Cloud integration (not grafana.com/dashboards) provides Cloudflare Workers pre-built dashboards
- Unlink safety: backend enforces min 2 account rows, credential unlinking blocked (use password change instead)

## What's Next

- **Apply migration 0004** — `npx wrangler d1 migrations apply sc-companion --remote`
- **Verify soft delete** — delete test account, confirm tombstone row + audit trail, confirm re-login blocked
- **Admin UI for suspend/ban** — uses new statuses but is separate work

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

