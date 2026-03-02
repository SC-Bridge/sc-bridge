# WORKLOG v1

@ACTIVE
# sid|registered|last_active|scope
1b6a23b8|2026-03-02T14:42+1300|2026-03-02T15:22+1300|loot-wishlist+0037-debug
870781b4|2026-03-02T14:37+1300|2026-03-02T16:28+1300|svg-crash-fix+shipdetail-ab-removal
@FILES
# sid|file_path
870781b4|src/routes/contracts.ts
870781b4|src/index.ts
870781b4|.claude/session-journal.md
870781b4|frontend/src/pages/ShipDetail.jsx
870781b4|frontend/src/assets/icons/pistol-s38.svg
870781b4|frontend/src/assets/icons/brand-glsn.svg
870781b4|frontend/src/assets/icons/selfdestruct.svg
870781b4|frontend/src/assets/icons/scanner.svg
870781b4|frontend/src/assets/icons/quantumfueltank.svg
870781b4|frontend/src/assets/icons/maneuveringthruster.svg
870781b4|frontend/src/assets/icons/mainthruster.svg
870781b4|frontend/src/assets/icons/fueltank.svg
870781b4|frontend/src/assets/icons/fuelnozzle.svg
870781b4|frontend/src/assets/icons/fuelintake.svg
870781b4|frontend/src/assets/icons/container.svg
870781b4|frontend/src/assets/icons/utility.svg
870781b4|frontend/src/assets/icons/quantumdrive.svg
870781b4|frontend/src/assets/icons/cooler.svg
a316152b|CLAUDE.md
a316152b|README.md
a316152b|SCWIKI_SYNC_PLAN.md
a316152b|.claude/session-journal.md
1b6a23b8|src/db/migrations/0037_patch_versioning.sql
1b6a23b8|src/db/migrations/0038_user_loot_wishlist.sql
1b6a23b8|src/db/queries.ts
1b6a23b8|src/routes/loot.ts
1b6a23b8|frontend/src/hooks/useAPI.js
1b6a23b8|frontend/src/pages/LootDB.jsx

@LOG
# timestamp|sid|op|detail
14:37+1300|870781b4|REG|started
14:38+1300|870781b4|DEBUG|/api/contracts returning HTML — Worker running but contracts route absent from deployed bundle
14:38+1300|870781b4|FIX|root cause: wrangler deploy used stale Vite bundle; @cloudflare/vite-plugin compiles Worker — must npm run build first
14:38+1300|870781b4|BUILD|npm run build — contracts route present in new bundle
14:38+1300|870781b4|DEPLOY|wrangler deploy → version 39ba5b50 — /api/contracts now live
14:38+1300|870781b4|VRF|curl scbridge.app/api/contracts → 81 contracts, application/json
14:39+1300|870781b4|FIX|14 SVGs: stripped xml:space=preserve + legacy Illustrator attrs (DOMException crash in Firefox)
14:39+1300|870781b4|REFACTOR|ShipDetail.jsx: removed A/B toggle, deleted classic OverviewTab/LoadoutItems/PerformanceTab
14:39+1300|870781b4|REFACTOR|ShipDetail.jsx: renamed Enhanced variants, removed layout state + FlaskConical import
14:39+1300|870781b4|BUILD|npm run build passed cleanly
14:40+1300|a316152b|REG|started
14:40+1300|a316152b|DOC|CLAUDE.md: removed scwiki.ts line, fixed pipeline/sync.ts descriptions, data sources table, key decisions, last migration → 0036
14:40+1300|a316152b|DOC|README.md: removed stale 03:00 and 03:05 SC Wiki cron entries
14:40+1300|a316152b|DEL|SCWIKI_SYNC_PLAN.md: deleted abandoned Go architecture planning doc
14:42+1300|1b6a23b8|REG|started
14:42+1300|1b6a23b8|FEAT|Phases 1-3 loot wishlist: manufacturer JOINs in getLootItems, 0038 migration, LootDB brand/set filters + wishlist tab + shopping list
14:42+1300|1b6a23b8|DEBUG|0037_patch_versioning: PRAGMA legacy_alter_table=ON — D1 does not support, no effect
14:42+1300|1b6a23b8|DEBUG|0037_patch_versioning: PRAGMA foreign_keys=OFF — no-op inside D1 transaction wrapper
14:42+1300|1b6a23b8|RCA|0037 root cause: D1 blocks DROP TABLE when FKs reference it; SQLite 3.26+ auto-updates FK refs on RENAME causing DROP to fail
14:42+1300|1b6a23b8|FIX|identified fix: replace rename→drop pattern with ALTER TABLE ADD COLUMN + UPDATE (no rebuild)
14:42+1300|1b6a23b8|PAUSE|user handling 0037 fix + R2 game file uploads in separate chat
15:22+1300|870781b4|COMMIT|24b9ae4 docs: remove SC Wiki sync references, update cron schedule
15:22+1300|870781b4|COMMIT|4bf3b69 fix(ship-detail): remove A/B toggle, collapse to enhanced view only
15:22+1300|870781b4|DONE|all tasks complete — awaiting push
15:22+1300|870781b4|PUSH|git push origin main → a038f2e..d675cee — CI/CD deploying
15:22+1300|1b6a23b8|REC|0037 applied out-of-band by other session; tables already rebuilt in D1
15:22+1300|1b6a23b8|FIX|marked 0037 applied in d1_migrations tracking table (INSERT)
15:22+1300|1b6a23b8|APPLY|0038_user_loot_wishlist applied via wrangler migrations apply — ✅
15:22+1300|1b6a23b8|VRF|typecheck clean; frontend build clean
15:22+1300|1b6a23b8|DEPLOY|wrangler deploy → version 61dd02c9 — loot wishlist + brand/set filters + patches live
15:22+1300|1b6a23b8|VRF|/api/loot → 5218 items with manufacturer_name; /api/patches → 4 versions
16:28+1300|a316152b|DONE|sync-reference-cleanup complete — committed 24b9ae4, session closed
16:28+1300|870781b4|VRF|CI for d675cee succeeded (03:23 UTC) — all code live on scbridge.app
16:28+1300|870781b4|VRF|session-journal.md: added 0037+0038 to migration table, updated Recent Changes
