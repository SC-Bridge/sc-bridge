# Session Journal

This file maintains running context across compactions.

## Supplementary Repo

All tools/scripts/extractors which are proprietary are stored in a private repo which can be found locally here: /home/gavin/scbridge

## Current Focus

Codebase audit — SMALL, MEDIUM, and LARGE improvements complete. HUGE items remain (H01-H06).

## Recent Changes

- **Codebase audit**: 3-agent parallel audit (backend, frontend, data/schema) → 64 findings in `docs/research/improvement-proposals.md`
- **SMALL improvements executed** (10 items done, 6 false positives identified, 1 skipped):
  - S01: Migration collision fixed (0045→0046)
  - S02: Cache-Control on `loot/:uuid` endpoint
  - S06: Deduplicated LOOT_CATEGORY_CASE (3 inline copies → shared constant in queries.ts)
  - S07/S08: Migration 0047 — 8 missing FK indexes
  - S10: `onRetry={refetch}` on all ErrorState calls across pages
  - S12: Extracted `StatusBadge` component from ShipDetail, used in ShipDetail + ShipDB
  - S13: LootDB silent `console.error` → user-visible error banner for collection/wishlist failures
  - S14: ConfirmDialog autoFocus on cancel button
- **MEDIUM improvements executed** (7 items done, 2 false positives, 3 deferred):
  - M02: Parallelized 8 sequential GDPR export queries with `Promise.all()` in account.ts
  - M04: Replaced sequential CF Images upload loop with `concurrentMap(vehicles, 5, ...)` in admin.ts
  - M06: Refactored `getUserLootWishlist` — 16 LEFT JOINs → CASE subqueries (matches `getLootItems` pattern)
  - M07: Replaced `window.confirm()` in UserManagement.jsx with ConfirmDialog component
  - M08: SearchInput API — `onChange` now passes value string (not event), all 7 callers updated
  - M09: FleetTable selected ship persists in URL (`?ship=123`) via `useSearchParams`
  - M10: Extracted shared `parseDate()` helper in dates.js, eliminating duplication
- **Component class robustness**: Migration 0046 (class column on vehicle_components), updated queries.ts COALESCE chain, extraction scripts
- **LARGE improvements executed** (6 items done, 1 false positive, 5 deferred):
  - L01: 404 page — `NotFound.jsx` component + catch-all route in App.jsx
  - L02: Shared loot constants — `frontend/src/lib/lootDisplay.js` (RARITY_STYLES, CATEGORY_LABELS, etc.), updated LootDB, POIDetail, POI
  - L03: Shared fleet overview grid — `FleetOverviewGrid.jsx` component, replaced ~80 lines in both Dashboard + Analysis
  - L04: useAPI refactor — single `apiFetch(method, path, body)` base, 3 standalone functions converted from raw fetch
  - L06: Section error boundaries — `SectionBoundary.jsx` wrapping charts + AI insights in Dashboard/Analysis
  - L08: Analysis prompt extraction — `src/lib/analysis-prompt.ts` (~150 lines out of analysis.ts)
  - Deferred: L05 (mobile filter — partially valid), L07 (inline SQL — diminishing returns), L09 (rate limiting — CF WAF), L11 (rarity data — pipeline), L12 (split queries.ts — has internal organization)
  - False positive: L10 (out-of-band columns — all in migration files since 0037)

## Key Decisions

- **Hono Workers routing gotcha**: `app.on()` / `app.get()` route wildcards (`*`, `**`) do NOT match multi-segment paths in CF Workers v8 runtime (works fine in Node.js). Use `app.use()` middleware wildcards for any multi-segment wildcard matching.
- **CF edge cache vs Workers Assets CDN**: "Purge Everything" clears CF edge cache but NOT internal Workers Assets CDN cache. `run_worker_first = true` routes all requests through Worker before Assets CDN.
- **Vite+Wrangler deploy order**: MUST `npm run build` then `wrangler deploy`. `wrangler deploy` alone uses cached `dist/sc_bridge/` — new routes added after last build will be missing from deployed Worker.
- **Loot filtering**: Client-side only — fetch all items once, filter in browser for instant UX. Server pagination would break search-as-you-type.
- **Hono generic typing**: `lootRoutes()` uses `Hono<HonoEnv>` directly (NOT `<E extends HonoEnv>` generic) — generic context breaks `c.get('user')` and `c.env.DB` type inference.
- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity
- **Audit false positives**: Always verify audit findings against actual code before implementing. ~37% of SMALL, ~15% of MEDIUM, ~8% of LARGE findings were false positives.

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0044_invite_tokens.sql** (0045-0047 committed, not yet applied)

| #    | Migration               | What                                                              |
| ---- | ----------------------- | ----------------------------------------------------------------- |
| 0017 | rename_components       | `components` → `vehicle_components`                              |
| 0018 | loot_map                | `loot_map` table + FK cross-references                           |
| 0019 | fps_helmets             | Helmet table                                                      |
| 0020 | loot_map_helmet_fk      | `fps_helmet_id` on loot_map                                       |
| 0021 | fps_clothing            | Clothing table (slot-based)                                       |
| 0022 | loot_map_clothing_fk    | `fps_clothing_id` on loot_map                                     |
| 0023 | consumables             | Food/Drink table                                                  |
| 0024 | loot_map_consumable_fk  | `consumable_id` on loot_map                                       |
| 0025 | harvestables            | Harvestable items table                                           |
| 0026 | loot_map_harvestable_fk | `harvestable_id` on loot_map                                      |
| 0027 | props                   | Props table (plushies, medals, artifacts)                         |
| 0028 | loot_map_props_fk       | `props_id` on loot_map                                            |
| 0035 | contracts               | `contracts` table + seed data (81 rows)                           |
| 0036 | user_loot_collection    | `user_loot_collection` table + indexes                            |
| 0037 | patch_versioning        | `game_versions` table; 14 tables rebuilt with composite unique keys |
| 0038 | user_loot_wishlist      | `user_loot_wishlist` table + indexes                              |
| 0039 | loot_quantity           | `quantity` column on `user_loot_collection` + `user_loot_wishlist` |
| 0040 | fix_collection_fk       | Rebuild `user_loot_collection` — FK was pointing to dropped table |
| 0041 | fix_fk_references       | Fix FK references                                                 |
| 0042 | vehicles_acquisition    | `acquisition_source_name` on vehicles                             |
| 0043 | manufacturers_class     | `class` column on manufacturers                                   |
| 0044 | invite_tokens           | `invite_tokens` table                                             |
| 0045 | ship_missiles           | `ship_missiles` table + `ship_missile_id` FK on loot_map          |
| 0046 | component_class         | `class` column on vehicle_components + corrected manufacturers.class |
| 0047 | missing_indexes         | 8 FK indexes (user_fleet, paint_vehicles, vehicles, loot_map)    |

**Note:** All previously out-of-band columns are now included in migration files (rebuilt in 0037).

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir                | What                                               | Source                                       |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `ship_production_status/` | `production_status_id`                             | DataCore entity files                        |
| `auec_prices/`            | `price_auec`                                       | Raw `Data.p4k` via scdatatools (python3.10)  |
| `acquisition_types/`      | `acquisition_type`                                 | Contract + CZ JSONs                          |
| `loot_map/`               | `loot_map` table                                   | `Resolved/loot_map.json`                     |
| `lib/datacore.py`         | Shared helpers                                     | —                                            |
| `ship_components_core/`   | Power/cooler/shield/QD + class extraction          | DataCore ship component dirs                 |
| `ship_weapons/`           | Ship guns                                          | DataCore weapon dirs                         |
| `ship_missiles/`          | Missile racks                                      | DataCore missile dirs                        |
| `ship_misc/`              | Countermeasures/QED/jumpdrive                      | Multiple DataCore dirs                       |
| `ship_mining/`            | Mining modules → vehicle_components                | DataCore miningarm dir                       |
| `fps_weapons/`            | FPS personal weapons                               | DataCore fps_weapons dir                     |
| `fps_armour/`             | PU armour                                          | DataCore pu_armor dir                        |
| `fps_attachments/`        | Weapon modifiers                                   | DataCore weapon_modifier dir                 |
| `fps_utilities/`          | Consumables/grenades                               | Multiple consumable dirs                     |
| `fps_helmets/`            | Helmets                                            | DataCore starwear/helmet dir                 |
| `fps_clothing/`           | Clothing (all, incl. loot-only)                    | DataCore pu_clothing + pu_bespoke            |
| `consumables/`            | Food & Drink                                       | DataCore carryables/1h                       |
| `harvestables/`           | Harvestable items                                  | DataCore carryables/1h + 2h                  |
| `props/`                  | Misc props (Misc/\* types)                         | DataCore carryables/1h + 2h                  |
| `ship_salvage/`           | SalvageHead + SalvageModifier → vehicle_components | DataCore ships/utility/salvage               |
| `ship_ports/`             | Ship ports + default loadout → vehicle_ports       | DataCore spaceships + groundvehicles JSONs   |
| `ship_performance/`       | Flight stats (boost, angular vel, fuel, thrusters) | DataCore controller/fueltank/spaceship JSONs |
| `ship_thrusters/`         | Thruster stats_json UPDATE (UPDATEs existing rows) | DataCore ships/thrusters dir                 |

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:

```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## Open Issues (GitHub) — validated 2026-03-04

### Bugs
| # | Title | Notes |
|---|-------|-------|
| 32 | INSURANCE TRACKER Mobile | `grid-cols-3` no responsive breakpoint, `shrink-0` overflow on rows. CSS fix. |

### Enhancements
| # | Title | Notes |
|---|-------|-------|
| 31 | CF Images upload pipeline for paints | No CF Images support for paints yet. Needs migration, sync guard, upload pipeline. |
| 30 | Org settings page | Read-only display works. Needs PATCH endpoint + settings form. |
| 10 | Paint browser | Backend 100% done (API, junction table, types). Frontend page needed. |

### POI Feature (epic #9, area: loot) — #14-20
Feature implemented in code. GitHub issues #9, #14-20 still OPEN (never closed after implementation).

## What's Next

- **HUGE audit items** (H01-H06) — validate before implementing
- **Close POI issues** (#9, #14-20) on GitHub — code is shipped
- **Bug**: #32 (Insurance Mobile) — quick CSS fix
- **Paint browser** (#10) — backend done, frontend only
- **Org Settings** (#30) — backend + frontend
- **CF Images for paints** (#31) — larger pipeline work

## Weapon Mount Pattern (for future reference)

Gun ports in DataCore equip a weapon mount (fixed/gimbal bracket), not the weapon directly.
Mount UUID → `vehicle_ports.equipped_item_uuid` BUT mounts are NOT in `vehicle_components`.
The actual weapon is in a child port (`hardpoint_class_2`, `hardpoint_class_1_left`, etc.).
`getShipLoadout` uses CTE + COALESCE child-port fallback to resolve through the mount.
`_seat` is NOT safe to exclude — Mercury Star Runner `turret_top/bottom_seat` have real TurretBase components.

## Port Size / XML Pattern (for future reference)

Ship XMLs: `Extracted/XML/Data/Scripts/Entities/Vehicles/Implementations/Xml/{class_name}.xml`
Port sizes live in the XML, not in DataCore JSON. Walk `<Part name="hardpoint_*">` → `<ItemPort minSize maxSize flags>`.

- `$uneditable` flag → structural (door panel, relay) → hide (editable=0, clear port_type/category_label)
- `invisible uneditable` → internal system (e.g. radar) → KEEP showing (has real component)
- empty flags → normal player-swappable slot
- XML size_max for weapon ports = MOUNT size (e.g. S3 gimbal); `component_size` = actual weapon size (e.g. S2). Display prefers component_size, falls back to size_max for empty slots.

**XML Inheritance (MANUAL_XML_MAP):** Some ships use a different XML than their class name suggests. Verified via DataCore `vehicleDefinition` field:
- `RSI_Hermes` → `rsi_apollo.xml`; `GRIN_MDC/MTC` → `GRIN_MXC.xml`; `RSI_Ursa_Medivac*` → `RSI_Ursa_Rover.xml`
- `ARGO_ATLS` variants → NO vehicle XML (actor entity in `actor/actors/`, not `entities/vehicles/`)

**`hardpoint_weapon_gun` / `hardpoint_weapon_class` / `hardpoint_weapon_missile` prefixes** were missing from PORT_CATEGORIES — now fixed. These appear on Avenger, Vanguard, Pisces, Merlin, Archimedes.
extract.py ON CONFLICT now updates `port_type` so re-runs will fix existing rows.

---
**Session compacted at:** 2026-03-04 19:11:34


---
**Session compacted at:** 2026-03-04 19:25:05

