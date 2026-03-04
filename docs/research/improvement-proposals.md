---
description: Comprehensive codebase audit findings and improvement proposals for SC Bridge, organized by effort size and priority.
tags: [audit, improvements, roadmap, architecture, quality]
audience: { human: 80, agent: 20 }
purpose: { plan: 60, findings: 40 }
---

# SC Bridge — Improvement Proposals

**Audit date:** 2026-03-04
**Scope:** Full codebase — backend routes, frontend pages, database schema, extraction pipeline
**Methodology:** 3-agent parallel audit (backend, frontend, data/schema), each reading all files in scope
**Total findings:** 79 (deduplicated to 64 actionable items below, removing overlaps between audits)

---

## How to Read This Document

Proposals are organized by effort size. Within each size, items are ordered by **impact** (user-facing value or risk reduction). Each item has:

- **ID** — `B` = backend, `F` = frontend, `D` = data/schema
- **What** — The issue or opportunity
- **Where** — File(s) and line(s)
- **Impact** — Why it matters
- **Fix** — How to address it

---

## SMALL — Quick Wins (< 1 hour each)

These can be knocked out individually. Many are zero-risk, high-clarity fixes.

### S01 [D] Fix duplicate migration number 0045
**Where:** `src/db/migrations/0045_ship_missiles.sql` + `0045_component_class.sql`
**Impact:** Blocks all future migrations if not resolved. **Already fixed** — component_class renumbered to 0046.

### S02 [B] Add `Cache-Control` to `/api/loot/:uuid` detail endpoint
**Where:** `src/routes/loot.ts:186-192`
**Impact:** Every loot detail page view bypasses CDN cache. List and location endpoints already cache.
**Fix:** Add `c.header("Cache-Control", "public, max-age=300")`.

### S03 [B] Fix `patches.ts` response shape
**Where:** `src/routes/patches.ts:10-14`
**Impact:** Returns raw D1 wrapper `{results: [...], success, meta}` instead of just the array. Only endpoint with this inconsistency.
**Fix:** Return `c.json(rows.results)`.

### S04 [B] Remove unused `escapeHtml` export
**Where:** `src/lib/utils.ts:33-42`
**Impact:** Dead code. No callers anywhere.
**Fix:** Delete the function.

### S05 [B] Use subqueries for loot collection/wishlist UUID→ID lookups
**Where:** `src/routes/loot.ts:54-162` (6 endpoints)
**Impact:** Each mutation does 2 DB round-trips. Subquery reduces to 1.
**Fix:** `INSERT INTO user_loot_collection (user_id, loot_map_id) SELECT ?, id FROM loot_map WHERE uuid = ?`

### S06 [DONE] Deduplicate `LOOT_CATEGORY_CASE` in queries.ts
**Where:** `src/db/queries.ts` — 3 copies of the same 30-line CASE expression
**Impact:** Bug risk — adding a new FK column requires updating 3 places in sync.
**Fix:** Eliminated entirely — `category` is now a stored column on `loot_map` (H04 denormalization). `LOOT_CATEGORY_CASE` constant removed.

### S07 [D] Add missing indexes on FK columns
**Where:** `user_fleet.vehicle_id`, `paint_vehicles.paint_id`, `vehicles.manufacturer_id`
**Impact:** JOIN performance on these columns. SQLite doesn't auto-index FK columns.
**Fix:** Single migration adding 3 indexes.

### S08 [D] Add indexes on `loot_map` FK columns
**Where:** `loot_map.fps_weapon_id`, `fps_armour_id`, `fps_helmet_id`, `fps_clothing_id`, `vehicle_component_id`
**Impact:** Category CASE expression and reverse lookups benefit from indexes.
**Fix:** Single migration adding 5 indexes.

### S09 [B] Replace `SELECT *` in contracts.ts
**Where:** `src/routes/contracts.ts:18`
**Impact:** Fragile — schema changes silently alter API shape.
**Fix:** Explicit column list.

### S10 [F] Pass `onRetry` to ErrorState across all pages
**Where:** Dashboard, Analysis, FleetTable, ShipDB, LootDB, POI, POIDetail, Contracts, Insurance
**Impact:** Users must manually refresh on errors. `useAPI` already provides `refetch`.
**Fix:** Pass `refetch` as `onRetry` prop. ~5 min per page.

### S11 [F] Add empty state for zero Contracts results
**Where:** `Contracts.jsx` — filter yields no results, shows nothing
**Impact:** Users think page is broken.
**Fix:** Add "No contracts match your filters" message.

### S12 [F] Extract `StatusBadge` from ShipDB/ShipDetail
**Where:** Both files define identical inline `StatusBadge` functions
**Impact:** DRY violation — new production statuses need updating in 2 places.
**Fix:** Create `components/StatusBadge.jsx`.

### S13 [F] Fix `console.error` without user feedback in LootDB
**Where:** `LootDB.jsx:990,999,1009`
**Impact:** Collection/wishlist operations silently fail.
**Fix:** Show inline error toast or message.

### S14 [F] Add `autoFocus` to ConfirmDialog cancel button
**Where:** `frontend/src/components/ConfirmDialog.jsx`
**Impact:** Keyboard users land on dialog element, not an actionable button.
**Fix:** Add `autoFocus` to cancel button.

### S15 [D] Remove or document `LOOT_BASE_WHERE` placeholder
**Where:** `src/db/queries.ts:1126` — `lm.name NOT IN ('<= PLACEHOLDER =>')`
**Impact:** Dead code or unfinished filter. Confusing to readers.
**Fix:** Remove if dead; replace with actual values if intended.

### S16 [D] Fix hardcoded manufacturer ID in PDC extraction
**Where:** `scbridge/tools/scripts/ship_pdcs/extract_pdcs.py:16` — `BEHR_MANUFACTURER_ID = 390`
**Impact:** Breaks if manufacturers table is rebuilt (happened in migration 0037).
**Fix:** Use subquery `(SELECT id FROM manufacturers WHERE code = 'BEHR')`.

---

## MEDIUM — Targeted Improvements (1-4 hours each)

### M01 [B] Extract shared fleet query to queries.ts
**Where:** Copy-pasted across `fleet.ts:16-49`, `analysis.ts:29-67`, `orgs.ts:95-138`, `account.ts:530-564`
**Impact:** The same 6-table JOIN appears 4 times. Schema changes require 4 updates.
**Fix:** Create `getUserFleet(db, userId, options?)` in `queries.ts`. Options control optional JOINs.

### M02 [B] Parallelize `collectUserData` GDPR export
**Where:** `src/routes/account.ts:525-590`
**Impact:** 7 sequential independent queries. Could run in parallel.
**Fix:** `Promise.all()` or D1 batch.

### M03 [B] Add body size limit on HangarXplor import
**Where:** `src/routes/import.ts:28-35`
**Impact:** No size validation. Unbounded JSON array could consume Worker CPU.
**Fix:** `if (items.length > 5000) return 400`. Add Hono `bodyLimit` middleware.

### M04 [B] Parallelize admin bulk CF Images upload
**Where:** `src/routes/admin.ts:25-60`
**Impact:** Sequential per-vehicle API calls. `concurrentMap` already exists in utils.ts.
**Fix:** Use `concurrentMap` with concurrency 5-10.

### M05 [B] Batch `syncVehicleLoaners` inserts
**Where:** `src/sync/rsi.ts` — individual INSERT loop
**Impact:** N+1 pattern. One D1 batch call replaces N individual calls.
**Fix:** D1 batch API.

### M06 [D] Refactor `getUserLootWishlist` — 16 LEFT JOINs → CASE subqueries
**Where:** `src/db/queries.ts` ~line 950
**Impact:** Slower and harder to maintain than the CASE subquery pattern used by `getLootItems`.
**Fix:** Match the `getLootItems` pattern.

### M07 [F] Use `ConfirmDialog` in UserManagement instead of `window.confirm()`
**Where:** `UserManagement.jsx` — delete user action
**Impact:** Visual inconsistency. Every other destructive action uses ConfirmDialog.
**Fix:** Import and use ConfirmDialog with `variant="danger"`.

### M08 [F] Fix SearchInput synthetic event
**Where:** `frontend/src/components/SearchInput.jsx:16`
**Impact:** `onChange({ target: { value: '' } })` is a fake event — fragile contract.
**Fix:** Accept `onClear` callback or change API to accept value string.

### M09 [F] Add FleetTable URL state for selected ship
**Where:** `FleetTable.jsx` — detail panel doesn't update URL
**Impact:** Can't share or bookmark a fleet ship selection.
**Fix:** Use URL search params `?ship=123`.

### M10 [F] Extract shared date parsing helper
**Where:** `frontend/src/lib/dates.js` — `formatDate` and `formatDateOnly` duplicate 15-line parser
**Impact:** DRY. One parser, two formatters.
**Fix:** Extract `parseDate(input)` helper.

### M11 [D] Fix `ON CONFLICT(uuid)` in extraction scripts (post-0037)
**Where:** `scbridge/tools/scripts/ship_pdcs/extract_pdcs.py` and likely others
**Impact:** After 0037, unique constraint is `(uuid, game_version_id)`. Scripts using `ON CONFLICT(uuid)` may silently fail.
**Fix:** Update to `ON CONFLICT(uuid, game_version_id)` and include `game_version_id` in INSERTs.

### M12 [D] Add `vehicle_name_aliases` table for RSI sync
**Where:** `src/sync/rsi.ts` — `shipNameMap` (30+ entries) manually maintained
**Impact:** New ships silently fail paint sync if not in the hardcoded map.
**Fix:** DB-backed alias table, updatable without code deploys. Add logging for unmatched names.

### M13 [B] Make sort-by in contracts.ts safer
**Where:** `src/routes/contracts.ts:20-24`
**Impact:** String interpolation into SQL. Currently safe (allowlist), but fragile to edits.
**Fix:** Lookup map of allowed column → SQL fragment.

---

## LARGE — Significant Changes (4-16 hours each)

### L01 [F] Create 404 / Not Found page
**Where:** `App.jsx` — no catch-all route
**Impact:** Undefined URLs show blank page. React Router v6 needs `<Route path="*">`.
**Fix:** Create `NotFound.jsx`, add as last route.

### L02 [F] Extract shared loot display constants
**Where:** `LootDB.jsx:36-64`, `POIDetail.jsx:14-55`, partially in `POI.jsx`
**Impact:** CATEGORY_LABELS, RARITY_STYLES, etc. copy-pasted across 3 files.
**Fix:** Create `lib/lootConstants.js`. Import everywhere.

### L03 [F] Extract Dashboard/Analysis shared bento grid + charts
**Where:** Both pages render identical fleet overview grids and chart sections (~150 lines each)
**Impact:** Layout changes require updating both files.
**Fix:** `FleetOverviewGrid` and `FleetCharts` shared components.

### L04 [F] Refactor useAPI hook
**Where:** `frontend/src/hooks/useAPI.js:5-72`
**Impact:** `fetchJSON`, `postJSON`, `patchJSON`, `putJSON` duplicate error handling. Standalone functions bypass the helpers.
**Fix:** Single `apiFetch(method, path, body?)` base. Derive helpers.

### L05 [F] Add mobile filter panel for LootDB
**Where:** `LootDB.jsx:1098` — sidebar hidden below `lg` breakpoint
**Impact:** Mobile users can't filter by brand, rarity, set, or source.
**Fix:** Slide-over filter panel triggered by "Filters" button on mobile.

### L06 [F] Add error boundaries around page sections
**Where:** Global ErrorBoundary only. No granular boundaries on charts/AI/detail panels.
**Impact:** One Recharts error takes down the entire page.
**Fix:** Lightweight section boundaries with inline "Section failed to render" fallback.

### L07 [B] Move all inline SQL to queries.ts
**Where:** `fleet.ts`, `analysis.ts`, `orgs.ts`, `account.ts`, `contracts.ts`, `admin.ts`
**Impact:** SQL scattered across route files. Can't audit DB access from one place.
**Fix:** All SQL in `queries.ts`. Routes call query functions only.

### L08 [B] Separate analysis prompt from route file
**Where:** `src/routes/analysis.ts:200-800` — 600+ line template string
**Impact:** Prompt engineering mixed with route logic.
**Fix:** Move to `src/lib/analysis-prompt.ts`.

### L09 [B] Implement proper rate limiting
**Where:** `src/lib/auth.ts` — memory-based, per-isolate only
**Impact:** Trivially bypassable. Distributed requests across isolates skip limits entirely.
**Fix:** Cloudflare WAF rate limiting rules (no code changes, most effective).

### L10 [D] Create catch-up migration for out-of-band columns
**Where:** 7+ columns exist in D1 but not in migrations (`stats_json` ×5, `price_auec`, `acquisition_type`, `vehicle_component_id`)
**Impact:** Disaster recovery risk — recreating DB from migrations loses these columns.
**Fix:** Migration that adds all out-of-band columns idempotently.

### L11 [DONE] Fix rarity data in loot_map
**Where:** `loot_map.rarity` — all NULL/"Unknown"
**Impact:** Rarity badges and POI rarity distribution are meaningless. Documented known bug.
**Fix:** Fixed `determine_rarity()` in `build_loot_map.py` — tag path was `LootGeneration.Rarity.*` but actual DataCore paths are `LootGeneration.LootRarity.*`. Added fallback rules: junk types → N/A, NPC-only FPS gear → Uncommon, everything else → Common. Result: 5294/5294 items have rarity (0 empty).

### L12 [D] Split queries.ts into domain modules
**Where:** `src/db/queries.ts` — 1364 lines
**Impact:** Hard to navigate, high merge conflict risk.
**Fix:** `queries/fleet.ts`, `queries/loot.ts`, `queries/vehicles.ts`, etc. Re-export from index.

---

## HUGE — Strategic / Architectural (Multi-day+)

### H01 [B] Add automated test coverage
**Where:** Entire backend — zero test files exist
**Impact:** Every change is manually verified. Refactoring anything above is risky without tests. **Highest overall impact item.**
**Fix:** Start with integration tests on critical paths: auth flow, fleet import, loot CRUD. Use Miniflare + Vitest. Build progressively.

### H02 [B] Adopt input validation framework
**Where:** All route files — validation is ad-hoc
**Impact:** No consistent validation layer. Some endpoints validate, others don't.
**Fix:** Zod + `@hono/zod-validator`. Define schemas per endpoint.

### H03 [F] Decompose LootDB.jsx (1635 lines)
**Where:** `frontend/src/pages/LootDB.jsx`
**Impact:** ~15 sub-components, display constants, data transforms all in one file. Largest in codebase.
**Fix:** Directory structure: `LootDB/index.jsx`, `DetailPanel.jsx`, `ItemCard.jsx`, `WishlistTab.jsx`, etc.

### H04 [DONE] Denormalize loot query performance
**Where:** `getLootItems()`, `getUserLootWishlist()`, `getLootLocationDetail()` in `queries.ts`
**Impact:** 8 correlated CASE subqueries per row for manufacturer_name; LOOT_CATEGORY_CASE per row for category. ~5000 rows.
**Fix:** Denormalized `manufacturer_name` and `category` onto `loot_map` table (migration 0048). Simplified 4 query functions, removed `LOOT_CATEGORY_CASE`. Fixed rarity data in `build_loot_map.py` (`LootRarity` tag path fix + fallback rules). Loader refactored to two-pass approach (metadata UPSERT + JSON blob UPDATE) to avoid D1 SQLITE_TOOBIG errors. Deployed to production.
**Note:** Original proposal was to normalize JSON blobs into junction tables — investigation found JSON blobs aren't the bottleneck (excluded from summary endpoint). The actual fix was denormalization of computed columns.

### H05 [D] Automate extraction pipeline
**Where:** All scripts in `scbridge/tools/scripts/`
**Impact:** Patch-day updates are fully manual, 6-stage pipeline with dependencies. Missing a step corrupts data.
**Fix:** Runner script with stage ordering, checksums, version tracking. `extraction_runs` metadata table.

### H06 [D] Resolve multi-version support strategy
**Where:** `game_versions` table, `game_version_id` on 15 tables, `fps_ammo` skipped
**Impact:** Infrastructure cost paid but feature non-functional. `fps_ammo` inconsistent.
**Fix:** Decision: either fully implement or explicitly document as future-only. If deferring, add `fps_ammo` to match and document the single-version assumption.

---

## Priority Matrix

### Urgent (risk or blocking)
| ID | Item | Effort |
|----|------|--------|
| S01 | Migration number collision (**fixed**) | Done |
| M11 | ON CONFLICT(uuid) vs composite keys | Medium |
| L10 | Out-of-band column catch-up migration | Large |

### High Impact (user-facing quality)
| ID | Item | Effort |
|----|------|--------|
| L11 | Fix loot rarity data (**fixed**) | Done |
| S10 | onRetry on all error states | Small |
| L01 | 404 page | Large |
| S02 | Cache-Control on loot detail | Small |
| L05 | Mobile loot filters | Large |

### High Value Refactors (developer velocity)
| ID | Item | Effort |
|----|------|--------|
| H01 | Automated test coverage | Huge |
| M01 | Shared fleet query | Medium |
| L07 | All SQL in queries.ts | Large |
| L12 | Split queries.ts | Large |
| H03 | Decompose LootDB.jsx | Huge |
| L02 | Shared loot constants | Large |

### Low-Hanging Fruit (quick value)
| ID | Item | Effort |
|----|------|--------|
| S03 | Fix patches response | Small |
| S04 | Remove dead escapeHtml | Small |
| S05 | Subquery loot UUID lookups | Small |
| S06 | Deduplicate LOOT_CATEGORY_CASE (**fixed**) | Done |
| S07 | FK indexes (3) | Small |
| S12 | Extract StatusBadge | Small |

---

## Suggested Execution Order

**Phase 1 — Quick wins & risk reduction** (1-2 sessions)
S01-S16, M11, L10

**Phase 2 — Code quality foundation** (2-3 sessions)
M01, L07, L12, S06, L02, L08

**Phase 3 — User-facing improvements** (2-3 sessions)
L01, L11, L05, L06, S10, L03, L04

**Phase 4 — Strategic investments** (ongoing)
H01, H02, H03, H04, H05

---

*Generated by 3-agent parallel audit. Backend: 23 findings. Frontend: 26 findings. Data/schema: 30 findings. Deduplicated and cross-referenced into 64 actionable items above.*
