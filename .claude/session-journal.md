# Session Journal

This file maintains running context across compactions.

## Current Focus

**All code review findings resolved. Ready for OAuth SSO providers.**

## Recent Changes

- Implemented multi-provider LLM support: Anthropic, OpenAI (GPT-5.2/4o/4o-mini), Google (Gemini 2.5 Pro/Flash/Flash-Lite)
- Added `callOpenAI()` and `callGoogle()` with unified `callLLM()` dispatcher in analysis.ts
- Fixed test-connection to accept body params and return provider-specific models
- OpenAI uses `max_completion_tokens` (not `max_tokens`) for GPT-5.2 compat
- Test max_tokens bumped to 100 for Gemini thinking model compatibility
- Fixed timing leak: SHA-256 hash both values before `timingSafeEqual` (index.ts)
- Fixed import atomicity: insert-then-swap pattern using AUTOINCREMENT ID threshold (import.ts)
- Gated `runFullSync` behind `ENVIRONMENT === "development"` (sync.ts)
- All 3 low-severity Gemini findings resolved (rate limiting documented, init race acceptable, providers list updated)

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
- All DB timestamps are UTC — frontend converts via user timezone preference
- Date format: `YYYY-MMM-DD HH:MM AM/PM TZ` — locale-independent via `formatToParts()`
- Always use `CLOUDFLARE_API_TOKEN`. Always use `npx wrangler`

## What's Next

- **Wire up Google OAuth** — `npx wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, test login flow
- **Set up remaining OAuth providers** — GitHub, Discord, Twitch (same pattern)
- **Hide unconfigured SSO buttons** — endpoint to expose available providers
- **Register first user** + promote to super_admin
- **Test email verification** flow
- **Configure Cloudflare WAF Rate Limiting** — memory-based rate limiting is per-isolate only
