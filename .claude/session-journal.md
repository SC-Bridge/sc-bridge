# Session Journal

This file maintains running context across compactions.

## Current Focus

**User Change History — implemented, needs migration applied and manual testing.**

## Recent Changes

- Created `user_change_history` table + `change_event_types` lookup (migration 0003)
- Created `src/lib/change-history.ts` — fire-and-forget `logUserChange()` helper
- Wired into `account.ts`: unlink-provider, set-password, account-deleted
- Wired into `import.ts`: fleet_imported with vehicle_count metadata
- Wired into `settings.ts`: settings_changed (with old/new values), llm_config_changed
- Added Better Auth `databaseHooks` in `auth.ts`: account.create (provider_linked), session.delete (session_revoked), user.update (profile_updated)
- Added Better Auth `hooks.after` middleware: 2FA enable/disable, change-password, passkey add/delete

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
- Cloudflare observability MCP: account ID `4214879ee537a4840de659aafb7bf201` (NERDZ)
- Unlink safety: backend enforces min 2 account rows, credential unlinking blocked (use password change instead)
- `signIn.social()` with `callbackURL: '/account'` handles linking for already-authenticated users

## What's Next

- **Apply migration 0003** — `npx wrangler d1 migrations apply sc-companion --local` (or `--remote`)
- **Manual testing** — unlink provider, set password, import fleet → verify rows in `user_change_history`
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

