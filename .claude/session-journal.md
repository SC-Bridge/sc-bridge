# Session Journal

This file maintains running context across compactions.

## Current Focus

**Full code review fixes applied. Ready for OAuth SSO providers.**

## Recent Changes

- Full 3-reviewer code review (Claude Opus, Codex, Gemini) — 15 findings consolidated
- Fixed `usePreferences()` skip bug (blocker — 401 redirect loop for logged-out users)
- Fixed CORS localhost bypass in production (added ENVIRONMENT check)
- Added `escapeHtml()` to all email templates (auth + GDPR export)
- Added preferences endpoint validation (key allowlist + value length limits)
- Chunked import batches to stay under D1 1000-statement limit
- Batched account deletion for atomicity (single `db.batch()`)
- Restricted LLM provider to Anthropic only (was accepting openai/google but always called Anthropic)
- Stripped `custom_name` from LLM payload (personal data)
- Added timezone optimistic update rollback on API failure
- Cached `createAuth()` per isolate via WeakMap
- Fixed `encryptionKeyValidated` race (set flag after check, not before)
- Documented rate limiting limitation (memory storage is per-isolate on Workers)

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ account
- **D1:** `sc-companion` (33+ tables including Better Auth, Oceania region)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory per-request
- All DB timestamps are UTC (`CURRENT_TIMESTAMP` / `datetime('now')`) — frontend converts via user timezone preference
- Timezone preference uses `user_settings` key-value table (not a dedicated column) — extensible for future prefs
- Date format: `YYYY-MMM-DD HH:MM AM/PM TZ` (e.g. `2026-FEB-23 07:09 PM NZDT`) — locale-independent via `formatToParts()`
- Guests (not logged in) get browser timezone automatically; logged-in users get server-persisted preference
- Always use `CLOUDFLARE_API_TOKEN`. Always use `npx wrangler`

## What's Next

- **Commit review fixes** — all changes are staged but uncommitted
- **Wire up Google OAuth** — `npx wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, test login flow
- **Set up remaining OAuth providers** — GitHub, Discord, Twitch (same pattern)
- **Hide unconfigured SSO buttons** — endpoint to expose available providers
- **Register first user** + promote to super_admin
- **Test email verification** flow

