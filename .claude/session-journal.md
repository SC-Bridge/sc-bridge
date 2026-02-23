# Session Journal

This file maintains running context across compactions.

## Current Focus

**Observability working. Change history live in production. Ready for next feature.**

## Recent Changes

- Migration 0003 confirmed applied to remote D1 — `change_event_types` (16 rows) + `user_change_history` both live
- Observability fully working: New Relic (7,555 spans + 6,567 logs) + Grafana Cloud (Loki + Tempo)
- Grafana: installed "Cloudflare Workers" integration from Connections menu → pre-built dashboards working
- Loki label: `service_name="sc-bridge"` — Tempo: `{.service.name = "sc-bridge"}`

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

