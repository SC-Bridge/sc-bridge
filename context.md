# SC Bridge — Project Context & Vision

## What It Is

SC Bridge (scbridge.app) is a **universal hub for Star Citizen players** — a single web app that consolidates fleet management, loadout planning, loot tracking, trade logistics, and game reference data into one place. Think of it as the toolbox every Star Citizen player has open on their second monitor.

The project runs on Cloudflare Workers with a D1 database. It's built as a personal tool first, with the architecture to support multiple users when ready.

## What It Does Today

### Fleet Management (Core)
- **Ship tracking** — every ship in your hangar with insurance type, pledge data, warbond status, custom names, and equipped paints
- **Import from HangarXplor** — browser extension JSON export, clean-slate import with automatic ship matching via slug resolution
- **Insurance tracker** — LTI vs non-LTI breakdown, filterable by insurance status and warbond
- **Dashboard** — bento-grid overview: fleet value, cargo capacity, crew requirements, LTI coverage, flight-ready percentage, size distribution, role categories

### Ship Database
- **Full vehicle reference** — every ship and ground vehicle from SC Wiki with specs, dimensions, pricing, production status, manufacturer info, loaner mappings
- **Paint catalog** — ship skins with compatibility mapping (many-to-many), images from FleetYards and RSI CDN
- **Component database** — weapons, shields, drives, coolers, thrusters, avionics (synced from SC Wiki, stored but not yet surfaced in UI)

### Fleet Analysis
- **Algorithmic gap detection** — flags missing roles (Mining, Salvage, Medical, Refueling, Exploration, Cargo) with priority ratings
- **Redundancy detection** — identifies over-represented role categories
- **AI-powered insights** — sends sanitised fleet data to Claude/GPT/Gemini for structured analysis covering composition, role coverage, insurance status, and an optimization roadmap
- **Analysis history** — every AI analysis saved and browsable

### FPS Item Database (Data Synced, UI Pending)
- **FPS weapons** — personal weapons with manufacturer, type, size
- **FPS armour** — armor sets, helmets, undersuits with grade data
- **Attachments, ammo, utilities** — weapon mods, ammunition types, MedPens, grenades, gadgets, backpacks
- **Ship hardpoints/ports** — full port tree per vehicle with equipped items, size ranges, categories

### Multi-User Auth
- Email/password, OAuth (Google, GitHub, Discord, Twitch), TOTP 2FA, WebAuthn passkeys
- Role-based access: user, admin, super_admin
- Admin panel for sync management and user administration

---

## Where It's Going

The fleet manager is the foundation. The vision is a comprehensive Star Citizen bridge that covers every aspect of the game a player needs quick access to.

### 3D Rendered Armour & Weapons
- Interactive 3D viewer for FPS armor sets and weapons using the game's model/texture data
- Rotate, zoom, inspect equipment before buying or looting
- Compare loadouts visually — see what a full set looks like assembled
- Leverage the FPS item data already synced from SC Wiki as the metadata backbone

### In-Game Loot Table
- **Full loot database** — every lootable item in the game, what it is, what it's worth
- **Location mapping** — where each item spawns: which bunkers, caves, wrecks, derelicts, outposts
- **Loot tier system** — rarity/quality classifications
- **Filterable by location** — "I'm going to Kareah, what can I find there?"
- **Filterable by item** — "Where do I find a Gallant rifle?"
- Community-sourced data with verification (loot tables change with patches)

### Trade Route Calculator
- **Commodity prices** — buy/sell prices at every location, updated from community data sources
- **Route optimization** — given your ship's cargo capacity and current location, calculate the most profitable routes
- **Multi-stop planning** — chain trades across multiple stops
- **Risk assessment** — factor in route danger (piracy hotspots, Quantum travel distance)
- **Ship-aware** — automatically uses your fleet data to calculate capacity and range
- Integrates with the fleet manager — knows what cargo ships you own

### Keybinding Tool
- **Visual keybinding editor** — see your current Star Citizen keybinds laid out on a keyboard diagram
- **Import/export** — read SC's keybind XML files, share configs
- **Conflict detection** — flag duplicate bindings
- **Profile management** — different keybind profiles for different ships or playstyles (mining vs combat vs trading)
- **Community presets** — popular keybind configurations for common HOTAS/HOSAS setups

### Paint Collection & Loadout Builder
- Surface the `user_paints` data already tracked — show what paints you own and which ships they apply to
- Visual loadout builder — pick a ship, equip components from the component database, see stats change
- Share loadouts as links

### Expanded Ship Database
- Surface the component and hardpoint data already synced
- **Hardpoint browser** — see every port on a ship, what's equipped stock, what fits
- **Component comparison** — compare shields, drives, weapons side by side
- **DPS calculators** — theoretical damage output for weapon loadouts

---

## Data Sources

| Source | What It Provides | Sync Frequency |
|--------|-----------------|----------------|
| **SC Wiki API** | Ships, manufacturers, specs, components, FPS items, loaners | Nightly (0300 UTC) |
| **FleetYards API** | Ship and paint store images | Nightly (0315 UTC) |
| **scunpacked-data** | Paint metadata, ship compatibility tags | Nightly (0330 UTC) |
| **RSI GraphQL API** | Ship and paint images from RSI CDN | Nightly (0345 UTC, opt-in) |
| **HangarXplor** | User fleet data (insurance, pledges, custom names) | Manual import |
| **Community sources** | Loot tables, trade prices, keybind presets | Future — TBD |

## Tech Stack

- **Backend:** Cloudflare Workers (TypeScript, Hono framework)
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** React SPA (Vite, Tailwind CSS, Lucide icons)
- **Auth:** Better Auth (email/password, OAuth, 2FA, passkeys, RBAC)
- **AI:** Anthropic Claude / OpenAI / Google Gemini (user-provided API keys)
- **Email:** Resend (transactional — verification, password reset)
- **CI/CD:** GitHub Actions → `wrangler deploy`
- **Hosting:** `scbridge.app` on Cloudflare Workers

## Design Principles

- **Data-rich, not data-heavy** — show what matters at a glance, details on demand
- **Dark theme, sci-fi aesthetic** — matches the game's vibe (Electrolize font, cyan accent, panel-based layout)
- **Accessibility first** — WCAG 2.2 AA, dyslexia-friendly font options, keyboard navigation, skip links
- **Offline-capable data** — sync game data nightly so the app works fast regardless of external API availability
- **Your data stays yours** — self-hosted, no telemetry, API keys encrypted at rest
