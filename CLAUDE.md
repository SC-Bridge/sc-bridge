# Fleet Manager — Project Context

## What This Is
A Star Citizen fleet management app that tracks ships, insurance, pledge data, and fleet composition. Built as a self-hosted web app designed to run in a Kubernetes cluster via BJW-S app-template.

## Tech Stack
- **Backend:** Go 1.22, Chi router, SQLite (default) or PostgreSQL
- **Frontend:** React SPA (Vite), Tailwind CSS, Lucide icons
- **Deployment:** BJW-S app-template v3.x Helm chart, Flux GitOps

## Architecture

### Backend (`/internal/`)
- `api/router.go` — All HTTP handlers and routes. Import logic, settings, debug endpoints.
- `database/database.go` — SQLite/PostgreSQL data layer. Vehicles, user_fleet, manufacturers, sync_history tables.
- `database/migrations.go` — Schema definitions. 25 tables including lookup tables and `paint_vehicles` junction.
- `sync/scheduler.go` — Cron-based sync: SC Wiki (primary data), FleetYards (images only), RSI API (images).
- `fleetyards/client.go` — FleetYards API client. Image-only — fetches store images for ships and paints by slug.
- `scunpacked/reader.go` — Parses paint_*.json files from scunpacked-data repo.
- `scunpacked/sync.go` — Matches paints to vehicles by tag (many-to-many via `paint_vehicles`), tag alias map for unresolvable abbreviations.
- `rsi/import.go` — One-time RSI extract image importer. Reads ship matrix + paint catalog JSON extracts, matches to DB vehicles/paints by name, updates image URLs with RSI CDN links.
- `rsi/client.go` — RSI GraphQL client with rate limiting and 429 retry. No auth needed.
- `rsi/sync.go` — RSI API syncer: ships and paints from public GraphQL API with pagination.
- `rsi/parser.go` — Parses RSI GraphQL browse response (shared shape for ships and paints).
- `scwiki/client.go` — SC Wiki API client with rate limiting.
- `scwiki/sync.go` — SC Wiki sync logic: manufacturers, vehicles (specs, dimensions, pricing, status), loaners.
- `scwiki/models.go` — SC Wiki API response types.
- `analysis/analysis.go` — Fleet analysis: gap detection, redundancies, insurance summary.
- `models/models.go` — All data models and JSON serialization.
- `config/config.go` — Environment variable configuration.

### Frontend (`/frontend/src/`)
- `pages/Dashboard.jsx` — Overview stats, quick actions
- `pages/FleetTable.jsx` — Sortable/filterable ship table with insurance column
- `pages/Insurance.jsx` — Insurance tracking view
- `pages/Analysis.jsx` — Gap analysis, redundancies, role distribution
- `pages/ShipDB.jsx` — Full ship database browser (data from SC Wiki)
- `pages/Import.jsx` — HangarXplor JSON import
- `hooks/useAPI.js` — API client hooks and action functions

## Data Flow

### Data Sources
1. **SC Wiki API** (primary) — All ship data: specs, dimensions, pricing, production status, descriptions, manufacturers, loaners. Synced nightly and on startup.
2. **FleetYards API** (images only) — Store images for ships and paints. Synced after SC Wiki so vehicles exist first.
3. **scunpacked-data** (paint metadata) — Local JSON files from `scunpacked-data` repo. Paint names, descriptions, ship compatibility tags. Synced after images.
4. **RSI API** (live images) — Ship and paint images from public GraphQL API at `/graphql` (no auth needed). Synced after paint sync, overwrites FleetYards with RSI CDN URLs. Opt-in via `RSI_API_ENABLED=true`.
5. **RSI extract images** (static fallback) — JSON extracts from RSI pledge store/ship matrix. Only runs when RSI API is not enabled. Provides RSI CDN ship images with multiple size variants.
6. **HangarXplor JSON** (user fleet) — Browser extension export. Insurance/pledge data (LTI, warbond, pledge cost/date). Only source for user fleet data.

### Ship Matching (slug generation)
HangarXplor ship_codes like `MISC_Hull_D` get converted to slugs for matching against the vehicle reference DB:
- `slugFromShipCode()` — strips manufacturer prefix, joins with hyphens: `hull-d`
- `slugFromName()` — strips punctuation including dots: `A.T.L.S.` → `atls`
- `compactSlug()` — strips ALL non-alphanumeric: `a-t-l-s` → `atls`
- `FindVehicleSlug()` — tries exact, name, then prefix match against vehicles table

## Key Design Decisions
- **Clean slate import**: HangarXplor import does DELETE all user_fleet + INSERT. No merging.
- **No UNIQUE constraint on user_fleet**: Users can own multiples of the same ship (e.g., two PTVs).
- **SC Wiki is primary data source**: All ship specs, dimensions, pricing, status, descriptions come from SC Wiki API.
- **FleetYards is images only**: Retained solely for store images (ships + paints). All non-image FleetYards code removed.
- **Paint sync pipeline**: scunpacked-data provides metadata (names, descriptions, ship tags), FleetYards provides paint images. UPSERT uses COALESCE so neither source overwrites the other.
- **Paints are many-to-many**: `paint_vehicles` junction table links paints to ALL compatible vehicles (e.g., Aurora paints → 5 variants). Tag alias map resolves abbreviations (890j→890-jump, star-runner→mercury-star-runner).
- **Insurance is typed**: `insurance_types` lookup table with duration_months (LTI, 120-month, 6-month, etc.)
- **user_fleet join table**: Links users to vehicle reference data. Insurance, pledge data, custom names live here.
- **Gap analysis uses contains matching**: Focus strings like "Prospecting / Mining" match gap terms like "mining" via `strings.Contains`.

## Build & Run
```bash
rm -f data/fleet-manager.db  # Clean DB if schema changed
cd frontend && npm install && npm run build && cd ..
go mod tidy && CGO_ENABLED=1 go build -o fleet-manager ./cmd/server
./fleet-manager
```

## Environment Variables
- `PORT` (default: 8080)
- `DB_DRIVER` (default: sqlite)
- `DB_PATH` (default: ./data/fleet-manager.db)
- `DATABASE_URL` (for postgres)
- `FLEETYARDS_BASE_URL` (default: https://api.fleetyards.net — images only)
- `SC_WIKI_ENABLED` (default: true)
- `SC_WIKI_RATE_LIMIT` (default: 1.0 req/s)
- `SC_WIKI_BURST` (default: 5)
- `SCUNPACKED_DATA_PATH` (default: "" — disabled when empty, set to path of scunpacked-data repo)
- `SYNC_SCHEDULE` (default: "0 3 * * *")
- `SYNC_ON_STARTUP` (default: true)
- `RSI_EXTRACT_PATH` (default: "" — disabled when empty, set to directory containing ships.json and paints.json RSI extracts)
- `RSI_API_ENABLED` (default: false — opt-in, enable to fetch live images from RSI GraphQL API)
- `RSI_BASE_URL` (default: https://robertsspaceindustries.com)
- `RSI_RATE_LIMIT` (default: 1.0 req/s)
- `STATIC_DIR` (default: ./frontend/dist)

## Debug Endpoint
`GET /api/debug/imports` — Shows vehicle_id linkage, fleet counts, sample entries.

## Image Data Rules (DO NOT BREAK THESE)

These rules exist because image data is fragile and SC Wiki sync runs nightly. Violating them causes images to silently vanish.

### Priority Order
RSI GraphQL (new CDN) > RSI old CDN > SC Wiki relative path > NULL

Higher-priority images must never be overwritten by lower-priority ones.

### vehicle_images is the source of truth
- Every vehicle in `vehicles` MUST have a corresponding row in `vehicle_images`
- `buildUpdateVehicleImagesStatement` uses INSERT ... ON CONFLICT DO UPDATE — never change it back to plain UPDATE
- When adding new vehicles (e.g., via migration), always create matching `vehicle_images` rows

### vehicles.image_url* must stay absolute
- SC Wiki provides relative `/media/...` paths — these must NEVER overwrite an absolute `https://` URL
- The upsert CASE expression in both `upsertVehicle` and `buildUpsertVehicleStatement` checks `LIKE 'http%'` before replacing
- Never change image COALESCE back to plain `COALESCE(excluded.image_url, vehicles.image_url)` — that treats relative paths as valid and overwrites absolute ones

### URL formats
- Old CDN: `https://media.robertsspaceindustries.com/{mediaID}/store_{size}.{ext}` (Google Cloud Storage)
- New CDN: `https://robertsspaceindustries.com/i/{hash}/resize(...)/filename.webp` (AWS CloudFront)
- SC Wiki relative: `/media/{mediaID}/store_small/{filename}.jpg` — NOT a valid image_url

### When writing migrations that insert vehicles
Always follow the INSERT with a corresponding INSERT OR IGNORE into `vehicle_images` using any available old-CDN URL.

## Owner Context
- Gavin, Senior QA at Pushpay (not a developer — explain things clearly)
- Runs a homelab Kubernetes cluster (TalosOS, Flux GitOps, BJW-S app-template)
- GitHub: gavinmcfall/fleet-manager
- Has 38 ships including custom-named ones (Jean-Luc = Carrack, James Holden = Idris-P)
