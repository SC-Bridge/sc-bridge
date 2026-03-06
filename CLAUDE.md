# SC Bridge — Project Context

## What This Is
A Star Citizen companion web app (`scbridge.app`). Tracks ships, fleet composition, insurance, loot
data, and item stats. Deployed as a Cloudflare Worker with a D1 database and React SPA frontend.

## Tech Stack
- **Backend:** TypeScript, Hono framework, Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite dialect), 47 migrations
- **Frontend:** React SPA (Vite), Tailwind CSS, Lucide icons, Recharts
- **Auth:** Better Auth v1.4.18 with Kysely D1 dialect
- **Deployment:** `wrangler deploy` via GitHub Actions on push to `main`

## Architecture

### Backend (`/src/`)
- `index.ts` — Hono app entry point. Registers all routes and global middleware (CORS, auth, logging, security headers).
- `lib/types.ts` — `Env`, `HonoEnv`, shared TypeScript types
- `lib/auth.ts` — `createAuth(env)` factory; cached per isolate via WeakMap
- `lib/logger.ts` — Structured JSON logging to Workers Observability
- `lib/crypto.ts` — ENCRYPTION_KEY validation and use
- `lib/slug.ts` — Slug generation utilities
- `lib/utils.ts` — Shared utilities (`concurrentMap`, etc.)
- `lib/cfImages.ts` — Cloudflare Images upload helpers
- `lib/email.ts` — Email sending via MailChannels
- `lib/constants.ts` — Shared constants
- `lib/change-history.ts` — User change history logging
- `lib/gravatar.ts` — Gravatar URL generation
- `lib/password.ts` — Password utilities
- `lib/rsi.ts` — RSI API client helpers
- `lib/validation.ts` — Zod input validation helpers (`zBody`, `zParams`, `zQuery`)

### Routes (`/src/routes/`)
- `fleet.ts` — User fleet CRUD, ship custom names
- `vehicles.ts` — Vehicle reference data (specs, images, components)
- `paints.ts` — Paint variants
- `import.ts` — HangarXplor JSON import (clean slate: DELETE + INSERT)
- `settings.ts` — User settings
- `sync.ts` — Trigger RSI image syncs
- `analysis.ts` — Fleet gap analysis, redundancy detection
- `account.ts` — Account management, email verification, 2FA
- `orgs.ts` — Organisation management and visibility
- `admin.ts` — Admin-only operations (CF Images bulk upload, invites, version management)
- `debug.ts` — `/api/debug/imports` — vehicle linkage, fleet counts
- `migrate.ts` — On-demand migration trigger
- `loot.ts` — Loot database, collection, wishlist, POI endpoints
- `contracts.ts` — Contract data
- `patches.ts` — Game version/patch endpoints

### Database (`/src/db/`)
- `queries.ts` — All D1 prepared statements. Single source of truth for DB access.
- `migrations/` — Sequential `NNNN_description.sql` files. Applied via `npx wrangler d1 migrations apply sc-companion --remote`.
- `CONVENTIONS.md` — Full DB conventions reference. Read this before writing any migration or query.

### Sync (`/src/sync/`)
- `rsi.ts` — RSI API sync: ship + paint images from public GraphQL API (ship image sync is a no-op — all ships have CF Images)
- `pipeline.ts` — Sync pipeline orchestration (RSI image sync only; paint metadata comes from DataCore extraction scripts, not live sync)

### Frontend (`/frontend/src/pages/`)
React SPA. 25 page components including: `Dashboard`, `FleetTable`, `ShipDB`, `ShipDetail`,
`Insurance`, `Analysis`, `AnalysisHistory`, `Import`, `Account`, `LootDB/`, `POI`, `POIDetail`,
`Contracts`, `Orgs`, `OrgProfile`, `Settings`, `Admin`, `UserManagement`, `Login`, `Register`.

`LootDB/` is the first directory-based page decomposition:
- `index.jsx` — Main component (state, tabs, Browse/Collection/Wishlist inline)
- `DetailPanel.jsx` — Item detail slide-over + stat helpers/constants
- `LocationSection.jsx` — Location grouping (containers, NPCs, shops)
- `lootHelpers.js` — `extractSetName`, `resolveLocationEntry`, `buildShoppingList`, pagination constants
- `ItemCard.jsx`, `WishlistRow.jsx`, `CollectionStepper.jsx`, `SourceIcons.jsx` — Extracted sub-components

## Cron Jobs (wrangler.toml)

| Schedule | Task |
|----------|------|
| `30 3 * * *` | Session cleanup — expired sessions + verifications |
| `45 3 * * *` | RSI API images — ship + paint images from RSI GraphQL |

## Data Sources

| Source | What | When |
|--------|------|------|
| RSI GraphQL API | Ship + paint images from public store API | Nightly (3:45 AM cron) |
| HangarXplor JSON | User fleet: insurance, pledge cost/date | User-triggered import |
| DataCore (scbridge/tools) | Component stats, FPS gear, loot map, paint metadata | One-time extract scripts |

## Key Design Decisions
- **Game version management**: `lootBaseWhere(patchCode?)` replaces the old `LOOT_BASE_WHERE` constant. All loot endpoints accept `?patch=` query param. `GameVersionProvider` context provides `activeCode` to all loot hooks. Admins can set `adminPreviewPatch` in user settings to preview unreleased data (amber badge in sidebar). Public default version is managed via `PUT /api/admin/versions/default`.
- **Clean slate import**: HangarXplor import does DELETE all user_fleet + INSERT. No merging.
- **No UNIQUE on user_fleet**: users can own multiples of the same ship (two PTVs, etc.).
- **RSI sync**: ship image sync is guarded by CF Images check (no-op for all ships). Paint image sync has no CF Images guard — fix before uploading paint CF Images.
- **Paints are many-to-many**: `paint_vehicles` junction table links paints to all compatible vehicles.
- **Insurance is typed**: `insurance_types` lookup table with `duration_months` (LTI, 120-month, etc.)
- **Better Auth org tables use camelCase** in D1: `organizationId`, `userId`, `createdAt`.
- **`createAuth(env)` is cached per isolate** via WeakMap — do not call unconditionally per request.
- **org_visibility values**: `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Build & Deploy
```bash
# Type check
npm run typecheck

# Build — root vite build compiles worker + frontend into dist/
# IMPORTANT: `cd frontend && npm run build` only updates frontend/dist/ which wrangler ignores.
# Wrangler reads from dist/client/ (populated by the root build via @cloudflare/vite-plugin).
npm run build

# Deploy (requires CLOUDFLARE_API_TOKEN in env)
source ~/.secrets
npx wrangler deploy

# Migrations
npx wrangler d1 migrations apply sc-companion --remote
```

## Wrangler Config (`wrangler.toml`)
- **Worker name:** `sc-bridge`
- **Account:** NERDZ (`4214879ee537a4840de659aafb7bf201`)
- **D1 database:** `sc-companion` (`56875a7e-0ebd-4455-887d-5d1e1afdb416`)
- **R2 bucket:** `sc-bridge-avatars` (bound as `AVATARS`)
- **Assets dir:** `./frontend/dist` (with `run_worker_first = true`)

---

## DB Schema Rules (DO NOT BREAK THESE)

Full conventions are in `src/db/CONVENTIONS.md`. The rules below are the critical ones that
have caused bugs before or are easy to get wrong.

### Naming
- Table names: `snake_case`, plural (`vehicles`, `fps_weapons`, `vehicle_components`)
- Namespaces: `vehicle_*` for ship items, `fps_*` for personal gear, `user_*` for user data
- No namespace prefix for core entities (`vehicles`, `paints`, `manufacturers`)
- Functions in `queries.ts`: match the table name — `buildUpsertVehicleComponentStatement` for `vehicle_components`

### Schema
- PK: always `id INTEGER PRIMARY KEY AUTOINCREMENT` — never UUID as PK
- UUIDs: separate `uuid TEXT NOT NULL UNIQUE` column when the row has a game-side UUID
- FKs: `{singular_table}_id INTEGER REFERENCES {table}(id)` — e.g., `manufacturer_id`, `fps_weapon_id`
- Junction tables: `{table1}_{table2}` alphabetically — e.g., `paint_vehicles` (not `vehicle_paints`)
- JSON blobs: `{field}_json TEXT` suffix — e.g., `containers_json`, `stats_json`
- Booleans: `INTEGER DEFAULT 0` (0 = false, 1 = true)
- Timestamps: `TEXT DEFAULT (datetime('now'))` — ISO 8601

### Migrations
- Files: `src/db/migrations/NNNN_description.sql` — sequential, zero-padded 4-digit
- Apply: `source ~/.secrets && npx wrangler d1 migrations apply sc-companion --remote`
- Never skip numbers. Never rename an applied migration file.
- **Never ALTER a PK or UNIQUE constraint in-place** — create new table, copy data, drop old.
- Index naming: `idx_{table}_{column}` — e.g., `idx_loot_map_type`
- Current last migration: **0049_contract_requirements.sql**

### Out-of-Band Columns
Previously these columns were applied via `wrangler d1 execute` outside migration files.
As of migration `0037_patch_versioning`, all tables were rebuilt and these columns are now
included in migration files. No current out-of-band columns exist.

---

## Image Data Rules (DO NOT BREAK THESE)

Image data is fragile. RSI API sync runs nightly and will silently overwrite if these rules
are violated.

### Priority Order
CF Images > RSI new CDN > RSI old CDN > SC Wiki relative path > NULL

Higher-priority images must **never** be overwritten by lower-priority ones.

### vehicle_images is the source of truth
- Every row in `vehicles` MUST have a corresponding row in `vehicle_images`
- `buildUpdateVehicleImagesStatement` uses INSERT ... ON CONFLICT DO UPDATE — never revert to plain UPDATE
- When migrations insert new vehicles, always follow with INSERT OR IGNORE into `vehicle_images`

### vehicles.image_url* must stay absolute
- SC Wiki provides relative `/media/...` paths — these must NEVER overwrite an absolute `https://` URL
- The CASE expression in `upsertVehicle` and `buildUpsertVehicleStatement` checks `LIKE 'http%'` before replacing
- Never simplify the image COALESCE — `COALESCE(excluded.image_url, vehicles.image_url)` would allow relative paths to overwrite absolute ones

### URL formats
- CF Images: `https://imagedelivery.net/{hash}/{imageId}/public`
- RSI new CDN: `https://robertsspaceindustries.com/i/{hash}/resize(...)/filename.webp`
- RSI old CDN: `https://media.robertsspaceindustries.com/{mediaID}/store_{size}.{ext}`
- SC Wiki relative: `/media/{mediaID}/store_small/{filename}.jpg` — NOT valid as `image_url`

---

## Owner Context
- Gavin — Senior QA at Pushpay
- Homelab: TalosOS Kubernetes cluster, Flux GitOps, BJW-S app-template
- GitHub: `gavinmcfall/fleet-manager`
- Has 38 ships including custom-named ones (Jean-Luc = Carrack, James Holden = Idris-P)
