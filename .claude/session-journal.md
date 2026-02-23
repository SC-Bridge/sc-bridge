# Session Journal

This file maintains running context across compactions.

## Current Focus

**OAuth-only user flows working. Google OAuth live. Set-password deployed — needs user testing.**

## Recent Changes

- Added custom `POST /api/account/set-password` for OAuth-only users (Better Auth's `setPassword` is server-only, no HTTP route)
- Added `GET /api/account/providers` to detect OAuth vs password users
- Frontend Account page: conditional "Set Password" (OAuth) vs "Change Password" (credential) sections
- 2FA section: warns OAuth-only users to set a password first
- Fixed TypeScript catch clause in analysis.ts (`TS2339` — typed the catch return)
- Google OAuth secrets confirmed set (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Fixed 4 consecutive CI/CD deploy failures caused by the TS error

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain

## Key Decisions

- Multi-provider LLM: Anthropic (Messages API), OpenAI (Chat Completions), Google (generateContent)
- API keys: `NERDZ_CODEX_API_KEY` for OpenAI, `NERDZ_GEMINI_API_KEY` for Google (in ~/.secrets)
- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- Better Auth `setPassword` has NO HTTP route (no path in `createAuthEndpoint`) — custom endpoint needed
- All DB timestamps are UTC — frontend converts via user timezone preference
- Date format: `YYYY-MMM-DD HH:MM AM/PM TZ` — locale-independent via `formatToParts()`
- Always use `CLOUDFLARE_API_TOKEN`. Always use `npx wrangler`
- Cloudflare observability MCP: account ID `4214879ee537a4840de659aafb7bf201` (NERDZ)

## What's Next

- **Test set-password flow** — Google signup → set password → enable 2FA (deployed, untested)
- **Set up remaining OAuth providers** — GitHub, Discord, Twitch (same pattern as Google)
- **Hide unconfigured SSO buttons** — endpoint to expose available providers
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only

---
**Session compacted at:** 2026-02-23 20:46:45


---
**Session compacted at:** 2026-02-23 20:54:20


---
**Session compacted at:** 2026-02-23 21:05:30


---
**Session compacted at:** 2026-02-23 21:09:47

