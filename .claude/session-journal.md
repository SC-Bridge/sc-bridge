# Session Journal

This file maintains running context across compactions.

## Supplimentary Repo

All tools/scripts/extractors which are propriatary are stored in a private repo which can be found locally here: /home/gavin/scbridge

## Current Focus

stats_json population — **COMPLETE** for helmets and attachments.

## Recent Changes

- **stats_json: helmets + attachments** (`411a303`): Fixed broken DataCore component names. 614/614 helmets now have resistance/emission/atmosphere stats. 69/99 attachments have zoom/sound/damage modifier stats. LootDB updated with labels, ordering, and formatted display (40% reduction, 4x zoom, etc.).
- **Loot FK: missiles + eyewear** (`cbb298c`): Migration 0045 (ship_missiles table + ship_missile_id FK). 64 missiles extracted → 25 matched in loot_map. fps_clothing extended with Char_Accessory_Eyes (slot='Eyes') → 9 eyewear matched. UI visible unmatched: **0**.
- **Invite tokens** (`b7c4b95`): Migration 0044 applied. Invite guard middleware, `/api/invites/validate`, `/api/admin/invites` POST+GET, Register.jsx token-aware UI, Admin.jsx InvitePanel. **DONE and working.**

## Key Decisions

- **Hono Workers routing gotcha**: `app.on()` / `app.get()` route wildcards (`*`, `**`) do NOT match multi-segment paths in CF Workers v8 runtime (works fine in Node.js). Use `app.use()` middleware wildcards for any multi-segment wildcard matching.
- **CF edge cache vs Workers Assets CDN**: "Purge Everything" clears CF edge cache but NOT internal Workers Assets CDN cache. `run_worker_first = true` routes all requests through Worker before Assets CDN.
- **Vite+Wrangler deploy order**: MUST `npm run build` then `wrangler deploy`. `wrangler deploy` alone uses cached `dist/sc_bridge/` — new routes added after last build will be missing from deployed Worker.
- **Loot filtering**: Client-side only — fetch all 5218 items once (~1.3MB), filter in browser for instant UX. Server pagination would break search-as-you-type.
- **Hono generic typing**: `lootRoutes()` uses `Hono<HonoEnv>` directly (NOT `<E extends HonoEnv>` generic) — generic context breaks `c.get('user')` and `c.env.DB` type inference.
- `vehicle_images` is source of truth; `vehicles.image_url` is denormalized effective URL for query simplicity

## Production

- **Domain:** `scbridge.app`
- **Worker:** `sc-bridge` on NERDZ Cloudflare account
- **D1:** `sc-companion` (46 tables, Oceania region)
- **CI/CD:** Push to main → GitHub Actions → `wrangler deploy`
- **Auth:** Better Auth v1.4.18, Kysely D1 dialect, `createAuth(env)` factory cached per isolate via WeakMap
- **Org visibility:** `'public' | 'org' | 'officers' | 'private'` (DEFAULT `'private'`)

## Applied Migrations (D1)

Last applied: **0043_manufacturers_class.sql** (0044 committed, not yet applied)

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
| 0037 | patch_versioning        | `game_versions` table; 14 tables rebuilt with composite unique keys; seeded `4.6.0-live.11319298` |
| 0038 | user_loot_wishlist      | `user_loot_wishlist` table + indexes                              |
| 0039 | loot_quantity           | `quantity` column on `user_loot_collection` + `user_loot_wishlist` |
| 0040 | fix_collection_fk       | Rebuild `user_loot_collection` — FK was pointing to dropped `loot_map_old` |

**Out-of-band columns** (applied via wrangler execute, not in migration files):

- `vehicle_components.stats_json`, `fps_weapons.stats_json`, `fps_armour.stats_json`
- `fps_attachments.stats_json`, `fps_utilities.stats_json`
- `vehicles.price_auec`, `vehicles.acquisition_type`

## Applied DB State (SC 4.6.0)

- **vehicles**: 303 ships, all with CF Images IDs (`imagedelivery.net`)
- **vehicle_ports**: 27,058 rows (player ships + 13 GV types; INSERT...SELECT skips AI variants)
- **vehicle_components**: 2080 rows (ship components + mining modules + 9 salvage attachments)
- **fps_weapons**: 404; **fps_armour**: 1779; **fps_attachments**: 488; **fps_utilities**: 50
- **fps_helmets**: 614; **fps_clothing**: 1785 (includes loot-only); **consumables**: 206
- **harvestables**: 77 (1h + 2h + tractorbeamonly — incl. Irradiated Apex Fang, TBO Yormandi Tongue); **props**: 246
- **loot_map**: 5218 items, **4829 with FK matches (92.5%)**

Remaining 389 unmatched (7.5%): NOITEM_Vehicle (48), no-type (47), UNDEFINED (39),
Char_Skin_Color (38), placeholder Usable (29), Missile/Missile (19), Char_Head_Hair (19),
eyewear (~22), Char_Armor_Undersuit (9), Char_Armor_Helmet/Helmet (9), misc others.

## Data Extraction Scripts (`scbridge/tools/scripts/`)

| Script dir                | What                                               | Source                                       |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `ship_production_status/` | `production_status_id`                             | DataCore entity files                        |
| `auec_prices/`            | `price_auec`                                       | Raw `Data.p4k` via scdatatools (python3.10)  |
| `acquisition_types/`      | `acquisition_type`                                 | Contract + CZ JSONs                          |
| `loot_map/`               | `loot_map` table (5218 items)                      | `Resolved/loot_map.json`                     |
| `lib/datacore.py`         | Shared helpers                                     | —                                            |
| `ship_components_core/`   | Power/cooler/shield/QD                             | DataCore ship component dirs                 |
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

**scdatatools ZIP64 bug:** Fixed in `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. Use `python3.10` (NOT python3.14).

**D1 UPSERT FK subquery bug**: Subquery-resolved values in ON CONFLICT DO UPDATE SET don't reliably propagate. Always follow batch UPSERT with a direct correlated UPDATE:

```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

## What's Next

- **Paint images** — CF Images upload pipeline for paints
- **Org Settings page** (v2): update org metadata (RSI SID, social links)
- **stats_json for fps_utilities**: `SCItemConsumableParams` has no primitive heal/damage fields — consumable effects are file-referenced subtypes. Skip unless DataCore adds direct values.
- **stats_json for fps_armour (body)**: Same wrong component name bug as helmets — needs same fix (`SCItemSuitArmorParams`). Not yet done.

**COMPLETED:**
- Shopping list location names — already fully implemented via `lootLocations.js` (84 keys). Journal note was stale.
- stats_json helmets (614/614) + attachments (69/99 with modifiers)
- Loot unmatched items — 0 visible in UI

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

**Session compacted at:** 2026-03-01 08:35:38

---

**Session compacted at:** 2026-03-01 09:34:37

---

**Session compacted at:** 2026-03-01 09:57:05

---

**Session compacted at:** 2026-03-01 10:56:21

---

**Session compacted at:** 2026-03-01 11:31:51

---

**Session compacted at:** 2026-03-01 13:15:27

---

**Session compacted at:** 2026-03-01 13:28:35

---

**Session compacted at:** 2026-03-01 13:28:58

---

**Session compacted at:** 2026-03-01 13:29:57

---

**Session compacted at:** 2026-03-01 13:33:40

---

**Session compacted at:** 2026-03-01 13:39:11

---

**Session compacted at:** 2026-03-01 13:39:45

---

**Session compacted at:** 2026-03-01 14:16:28

---

**Session compacted at:** 2026-03-01 14:35:10

---

**Session compacted at:** 2026-03-01 15:06:17

---

**Session compacted at:** 2026-03-01 18:29:59

---

**Session compacted at:** 2026-03-02 06:19:33

---

**Session compacted at:** 2026-03-02 06:49:36

---

**Session compacted at:** 2026-03-02 07:11:48

---

**Session compacted at:** 2026-03-02 07:58:38

---

**Session compacted at:** 2026-03-02 08:37:14

---

**Session compacted at:** 2026-03-02 08:42:12

---

**Session compacted at:** 2026-03-02 08:54:01

---

**Session compacted at:** 2026-03-02 08:54:18

---

**Session compacted at:** 2026-03-02 08:55:10

---

**Session compacted at:** 2026-03-02 09:06:17

---

**Session compacted at:** 2026-03-02 09:34:30

---
**Session compacted at:** 2026-03-02 10:10:38


---
**Session compacted at:** 2026-03-02 10:16:26


---
**Session compacted at:** 2026-03-02 10:19:16


---
**Session compacted at:** 2026-03-02 10:19:38


---
**Session compacted at:** 2026-03-02 10:19:56


---
**Session compacted at:** 2026-03-02 10:27:15


---
**Session compacted at:** 2026-03-02 10:35:55


---
**Session compacted at:** 2026-03-02 10:48:01


---
**Session compacted at:** 2026-03-02 10:51:39


---
**Session compacted at:** 2026-03-02 11:07:12


---
**Session compacted at:** 2026-03-02 11:08:07


---
**Session compacted at:** 2026-03-02 11:08:23


---
**Session compacted at:** 2026-03-02 11:22:46


---
**Session compacted at:** 2026-03-02 11:34:21


---
**Session compacted at:** 2026-03-02 11:58:59


---
**Session compacted at:** 2026-03-02 12:37:22


---
**Session compacted at:** 2026-03-02 12:40:31


---
**Session compacted at:** 2026-03-02 12:40:51


---
**Session compacted at:** 2026-03-02 12:41:08


---
**Session compacted at:** 2026-03-02 12:41:24


---
**Session compacted at:** 2026-03-02 12:45:45


---
**Session compacted at:** 2026-03-02 12:46:11


---
**Session compacted at:** 2026-03-02 12:47:54


---
**Session compacted at:** 2026-03-02 12:48:28


---
**Session compacted at:** 2026-03-02 14:37:06


---
**Session compacted at:** 2026-03-02 14:41:11


---
**Session compacted at:** 2026-03-02 17:01:52


---
**Session compacted at:** 2026-03-02 17:20:06


---
**Session compacted at:** 2026-03-02 18:00:00


---
**Session compacted at:** 2026-03-02 18:23:33


---
**Session compacted at:** 2026-03-02 20:39:24


---
**Session compacted at:** 2026-03-03 06:54:38


---
**Session compacted at:** 2026-03-03 07:27:12


---
**Session compacted at:** 2026-03-03 08:05:51


---
**Session compacted at:** 2026-03-03 08:08:47


---
**Session compacted at:** 2026-03-03 08:38:47


---
**Session compacted at:** 2026-03-03 09:11:37


---
**Session compacted at:** 2026-03-03 09:42:21


---
**Session compacted at:** 2026-03-03 09:46:27


---
**Session compacted at:** 2026-03-03 10:02:11


---
**Session compacted at:** 2026-03-03 10:43:08


---
**Session compacted at:** 2026-03-03 10:44:04


---
**Session compacted at:** 2026-03-03 10:55:49


---
**Session compacted at:** 2026-03-03 11:33:46


---
**Session compacted at:** 2026-03-03 12:34:07


---
**Session compacted at:** 2026-03-03 13:21:07


---
**Session compacted at:** 2026-03-03 13:45:41


---
**Session compacted at:** 2026-03-03 14:05:03

