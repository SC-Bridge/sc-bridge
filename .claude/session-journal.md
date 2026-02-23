# Session Journal

This file maintains running context across compactions.

## Current Focus

**Auth deployed. Waiting on domain decision before setting up OAuth providers.**

## Recent Changes

- Fixed missing `signIn` import in Login.jsx (would have crashed on login attempt)
- Created `context.md` — project vision document covering current features and future roadmap
- SocialLoginButtons extracted into shared component with Simple Icons SVGs, `currentColor` fill
- SSO buttons added to Register page (previously only on Login)
- All 5 auth phases code-complete and deployed to production
- D1 has 33 tables (Better Auth + app tables), all migrations applied

## Production

- **Domain:** `scbridge.app` (new — previously `fleet.nerdz.cloud`)
- **Worker:** `sc-bridge` on NERDZ account (renamed from `sc-companion`)
- **D1:** `sc-companion` (33 tables including Better Auth, Oceania region — DB name unchanged)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain — `noreply@scbridge.app` (transactional), `ops@scbridge.app` (infrastructure)

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory per-request
- Better Auth tables created via direct D1 SQL (Zero Trust blocks `/api/migrate` from CLI)
- Session cleanup runs daily at `0 3 * * *` (merged with SC Wiki sync) — free plan only allows 5 cron triggers
- Always use `CLOUDFLARE_API_TOKEN` from `~/.secrets` (source before wrangler commands)
- App renamed to "SC Bridge" (scbridge.app) — "SC BRIDGE" in UI, "Star Citizen Bridge" in titles/docs

## What's Next

- **Configure custom domain** — point `scbridge.app` to the `sc-bridge` worker in Cloudflare
- **Set up OAuth apps** — create apps at Google, GitHub, Discord, Twitch with callback URLs (`https://scbridge.app/api/auth/callback/<provider>`), then `wrangler secret put` for each
- **Hide unconfigured SSO buttons** — add endpoint to expose available providers so frontend only shows configured ones
- **Register first user** at `scbridge.app/register`
- **Promote to super_admin** via D1: `UPDATE "user" SET role = 'super_admin' WHERE email = '...'`
- **Test email verification** flow (Resend sends from `noreply@scbridge.app`)

---
**Session compacted at:** 2026-02-22 15:12:41


---
**Session compacted at:** 2026-02-22 17:46:51


---
**Session compacted at:** 2026-02-22 21:45:57


---
**Session compacted at:** 2026-02-23 08:28:05


---
**Session compacted at:** 2026-02-23 08:51:56


---
**Session compacted at:** 2026-02-23 09:03:55


---
**Session compacted at:** 2026-02-23 10:37:28


---
**Session compacted at:** 2026-02-23 11:34:00

