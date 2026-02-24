# Session Journal

This file maintains running context across compactions.

## Current Focus

**Admin completion + magic link implemented. Ready to deploy and verify.**

## Recent Changes

- `magicLink()` plugin added to `src/lib/auth.ts` (10-min expiry, reuses `buildTransactionalEmailHtml`)
- `magicLinkClient()` added to `frontend/src/lib/auth-client.js`
- Magic link toggle/form/sent state added to `Login.jsx` (collapsed by default)
- Impersonation button (UserCheck icon) added to `UserManagement.jsx` per-row actions
- Amber `ImpersonationBanner` added to `App.jsx` — shows when `session.impersonatedBy` is set
- `banned ↔ status` sync added to `user.update.after` hook — ban sets `status='banned'`, unban restores `status='active'`

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

- **Deploy to production** — push main to trigger CI/CD, verify impersonation + magic link + ban sync
- **Verify ban sync** — `SELECT banned, status FROM user WHERE id = ?` should show both columns in sync after ban/unban
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

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

