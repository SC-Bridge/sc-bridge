# SC Bridge

A Star Citizen companion app — fleet management, ship database, loot tracking, and game reference data. Live at [scbridge.app](https://scbridge.app).

## Tech Stack

- **Backend**: Cloudflare Worker (TypeScript), [Hono](https://hono.dev) framework
- **Database**: Cloudflare D1 (`sc-companion`), [Kysely](https://kysely.dev) query builder
- **Auth**: [Better Auth](https://www.better-auth.com) v1.4.18
- **Frontend**: React SPA, [Vite](https://vitejs.dev), Tailwind CSS
- **Storage**: Cloudflare R2 (avatar uploads), Workers Assets (SPA serving)
- **CI/CD**: GitHub Actions → `wrangler deploy` on push to `main`

## Features

- **Fleet Management** — track owned ships, custom names, insurance, and pledge data
- **Ship Database** — searchable/filterable browser of all Star Citizen ships with specs, pricing, and production status
- **Insurance Tracker** — LTI vs timed insurance dashboard with pledge history
- **Fleet Analysis** — gap detection, redundancy analysis, role distribution
- **HangarXplor Import** — upload JSON exports from the HangarXplor browser extension
- **Org Support** — org fleets with visibility controls (public / org / officers / private)

## Development

### Prerequisites

- Node.js 22+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account (for D1 and R2)

### Local Dev

```bash
npm install
npm run dev          # Vite dev server + Worker via miniflare
```

The Vite dev server proxies `/api/*` to the local Worker automatically.

### Build

```bash
npm run build        # Build frontend + bundle Worker
```

### Deploy

```bash
npm run deploy       # wrangler deploy (requires CLOUDFLARE_API_TOKEN)
```

Or push to `main` — GitHub Actions deploys automatically.

## Database

D1 database: `sc-companion` (Oceania region)

### Migrations

```bash
# Apply pending migrations to remote D1
source ~/.secrets
npx wrangler d1 migrations apply sc-companion --remote

# Apply locally (for development)
npm run db:migrate:local
```

Migrations live in `src/db/migrations/`. See `src/db/CONVENTIONS.md` for naming
conventions and schema design rules.

### Current Schema (SC 4.6.0)

46 tables including: `vehicles`, `vehicle_components`, `fps_weapons`, `fps_armour`,
`fps_attachments`, `fps_utilities`, `fps_helmets`, `fps_clothing`, `consumables`,
`harvestables`, `props`, `loot_map`, `orgs`, `org_members`, `user_fleet`.

Last applied migration: `0028_loot_map_props_fk.sql`

## Data Sync

Nightly cron triggers (defined in `wrangler.toml`) keep ship and item data current:

| Time (UTC) | What |
|------------|------|
| 03:30 | session cleanup + scunpacked paint metadata |
| 03:45 | RSI API paint images |

Manual sync is available via the admin panel or `POST /api/sync/*` endpoints.

## Infrastructure

- **Worker name**: `sc-bridge`
- **Account**: NERDZ Cloudflare account
- **Domain**: `scbridge.app` (proxied via Cloudflare)
- **R2 bucket**: `sc-bridge-avatars`
- **Observability**: Structured logs + OTEL traces → Grafana Cloud / New Relic

## Game Data Extraction

Ship specs, component stats, loot data, and item tables are populated from
Star Citizen game files using the extraction scripts in
`/home/gavin/scbridge/tools/scripts/`. See that repo's
[README](../scbridge/tools/scripts/README.md) for the full workflow.

## License

MIT
