# Session Journal

This file maintains running context across compactions.

## Current Focus

**Wiring up OAuth SSO providers — Google client ID/secret ready, need to `wrangler secret put` and test.**

## Recent Changes

- GDPR compliance deployed: privacy policy, terms of service, data export, account deletion
- App now publicly accessible without login — Dashboard shows landing page, Ship DB browsable
- Sidebar shows public nav (Dashboard, Ship DB) for guests, full nav when logged in
- Sign In / Create Account buttons in sidebar for unauthenticated users
- Protected routes individually wrapped with RequireAuth (not blanket wrapper)
- `useAPI` hook supports `skip` option for conditional fetching
- Register page has TOS checkbox (blocks submit) + social login TOS note
- Account page has Data & Privacy section (download/email export, danger zone deletion)
- Contact email is `support@scbridge.app` (not ops@)
- Deploy workflow passes commit message to `wrangler deploy --message`
- "by Unknown" in Cloudflare dashboard is a known API token limitation — no fix available

## Production

- **Domain:** `scbridge.app` (new — previously `fleet.nerdz.cloud`)
- **Worker:** `sc-bridge` on NERDZ account (renamed from `sc-companion`)
- **D1:** `sc-companion` (33 tables including Better Auth, Oceania region — DB name unchanged)
- **Branch:** `main`
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Email:** Resend via `scbridge.app` domain — `noreply@scbridge.app` (transactional), `support@scbridge.app` (public contact), `ops@scbridge.app` (infrastructure)

## Key Decisions

- Better Auth v1.4.18 with Kysely D1 dialect, `createAuth(env)` factory per-request
- Better Auth tables created via direct D1 SQL (Zero Trust blocks `/api/migrate` from CLI)
- Session cleanup runs daily at `0 3 * * *` (merged with SC Wiki sync) — free plan only allows 5 cron triggers
- Always use `CLOUDFLARE_API_TOKEN` (already exported in shell). Always use `npx wrangler` (not bare `wrangler`)
- App renamed to "SC Bridge" (scbridge.app) — "SC BRIDGE" in UI, "Star Citizen Bridge" in titles/docs
- Public landing page instead of login wall — guests see Dashboard + Ship DB, auth for fleet features
- Account deletion cascades through all app tables then Better Auth tables in FK order

## What's Next

- **Wire up Google OAuth** — `npx wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, test login flow
- **Set up remaining OAuth providers** — GitHub, Discord, Twitch (same pattern: create app, set callback URL `https://scbridge.app/api/auth/callback/<provider>`, `npx wrangler secret put` secrets)
- **Hide unconfigured SSO buttons** — add endpoint to expose available providers so frontend only shows configured ones
- **Register first user** + promote to super_admin
- **Test email verification** flow

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


---
**Session compacted at:** 2026-02-23 15:26:38


---
**Session compacted at:** 2026-02-23 17:30:03


---
**Session compacted at:** 2026-02-23 17:41:57

