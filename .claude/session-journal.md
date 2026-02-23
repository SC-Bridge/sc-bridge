# Session Journal

This file maintains running context across compactions.

## Current Focus

**Linked Accounts section on Account page — implemented, ready to deploy and test.**

## Recent Changes

- Added "Linked Accounts" PanelSection to Account page (between Profile and Password)
- Enhanced `GET /api/account/providers` to return `availableProviders` (configured OAuth providers)
- Added `POST /api/account/unlink-provider` endpoint with safety checks (min 2 auth methods, no credential unlinking)
- Extracted SSO provider metadata (icons, labels) to shared `frontend/src/lib/providers.js`
- Refactored `SocialLoginButtons.jsx` to import from shared providers constant
- Frontend shows linked providers with unlink buttons, and "Link" buttons for unlinked providers

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

- **Deploy and test linked accounts** — verify link/unlink flows with real OAuth providers
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

