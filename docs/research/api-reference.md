---
description: SC Bridge REST API endpoints — routes, parameters, query patterns, and design decisions.
tags: [api, routes, hono, cloudflare-workers, endpoints]
audience: { human: 40, agent: 60 }
purpose: { reference: 70, research: 30 }
---

# SC Bridge API Reference

## Architecture

Cloudflare Workers + Hono framework. All state in D1 (SQLite). Auth via Better Auth v1.4.18.

All query parameters use D1 `.bind()` prepared statements — never string interpolation.

Background work uses `c.executionCtx.waitUntil()` to survive the 30-second CPU limit.

---

## Base Paths

| Prefix | Module | Auth Required |
|--------|--------|---------------|
| `/api/ships/` | vehicles.ts | No |
| `/api/vehicles/` | fleet.ts | Yes |
| `/api/sync/` | sync.ts | Admin |
| `/api/paints/` | paints.ts | No |
| `/api/import/` | import.ts | Yes |
| `/api/analysis/` | analysis.ts | Yes |
| `/api/settings/` | settings.ts | Yes |
| `/api/orgs/` | orgs.ts | Yes |
| `/api/account/` | account.ts | Yes |
| `/api/admin/` | admin.ts | Admin |

---

## Ship Reference Endpoints

### GET /api/ships

List all vehicles (ship reference database, excludes paint variants).

**Filter:** `WHERE v.is_paint_variant = 0`

**Returns:** All ships with:
- Specs: `size_label`, `focus`, `classification`, `cargo`, `crew_min/max`, `speed_scm`
- Pricing: `pledge_price`, `price_auec`, `acquisition_type`, `acquisition_source_name`
- Images: `image_url`, `image_url_small`, `image_url_medium`, `image_url_large`
- Joined: `manufacturer_name`, `manufacturer_code`, `production_status`

**Note:** `price_auec` and `acquisition_type` are out-of-band columns — present in D1 but not in any migration file.

---

### GET /api/ships/:slug

Single ship detail. Same columns as list endpoint plus:
- `speed_max`, `health`, `vehicle_inventory`

Returns 404 if slug not found.

---

### GET /api/ships/:slug/loadout

Default loadout for a ship. Calls `getShipLoadout(db, slug)`.

**Returns:** Array of port entries. Each entry:
```json
{
  "port_name": "hardpoint_gun_class4_left",
  "category_label": "Weapons",
  "component_name": "Badger Repeater",
  "component_type": "WeaponGun",
  "component_size": 4,
  "grade": "A",
  "component_class": "Military",
  "manufacturer_name": "Klaus & Werner",
  "stats_json": "{ ... }"
}
```

**Key pattern:** Uses CTE + nested COALESCE to resolve through weapon-mount brackets — see [Ship Loadout Query Pattern](#ship-loadout-query-pattern).

**Empty array** returned (not 404) when no loadout data exists.

---

## Fleet Endpoints

All require authentication. User ID injected from auth context.

### GET /api/vehicles

User's fleet with all reference data denormalized. 5-way LEFT JOIN:

```sql
FROM user_fleet uf
JOIN vehicles v ON v.id = uf.vehicle_id
LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
LEFT JOIN paints p ON p.id = uf.equipped_paint_id
LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
WHERE uf.user_id = ?
```

**Returns per entry:** Fleet metadata (`pledge_cost`, `pledge_date`, `custom_name`, `warbond`, `is_loaner`) + vehicle reference (`vehicle_name`, `vehicle_slug`, `image_url`, `focus`, `size_label`) + joined labels.

### GET /api/vehicles/with-insurance

Identical to `/api/vehicles` — insurance data already included in base fleet response.

### PATCH /api/vehicles/:id/visibility

Update visibility and ops availability for a fleet entry.

**Body:**
```json
{
  "org_visibility": "public|org|officers|private",
  "available_for_ops": true
}
```

**Authorization:** `WHERE user_id = ? AND id = ?` — ownership enforced at DB level. Returns 404 if not found or not owned.

---

## Sync Endpoints

All POST endpoints return immediately and run in background via `waitUntil`.

### GET /api/sync/status

Last 10 sync operations with source labels.

### POST /api/sync/paints

Triggers scunpacked-data paint metadata sync. Reads `SCUNPACKED_REPO` and `SCUNPACKED_BRANCH` env vars.

### POST /api/sync/rsi

Triggers RSI API image sync. Requires `RSI_API_ENABLED=true` env var.

### POST /api/sync/all

Dev only (`ENVIRONMENT !== "development"` returns 403). Runs full pipeline in one invocation. May hit 30s CPU limit — production uses staggered crons instead.

---

## Ship Loadout Query Pattern

The most complex query in the codebase. Documented here for reference.

**Problem:** DataCore ship loadouts equip weapon-mount brackets (fixed/gimbal) onto gun ports, not the weapon directly. The mount is not in `vehicle_components`. The actual weapon lives in a child port one level deeper.

**Solution:** CTE + COALESCE with nested subquery fallback.

```sql
WITH ship_ports AS (
  SELECT * FROM vehicle_ports
  WHERE vehicle_id = (SELECT id FROM vehicles WHERE slug = ?)
)
SELECT
  p.name AS port_name,
  p.category_label,
  COALESCE(
    vc.name,
    (SELECT vc2.name FROM ship_ports c
     JOIN vehicle_components vc2 ON vc2.uuid = c.equipped_item_uuid
     WHERE c.parent_port_id = p.id LIMIT 1)
  ) AS component_name,
  -- Same COALESCE pattern for: component_type, sub_type, component_size,
  -- grade, stats_json, manufacturer_name, component_class
FROM ship_ports p
LEFT JOIN vehicle_components vc ON vc.uuid = p.equipped_item_uuid
LEFT JOIN manufacturers m ON m.id = vc.manufacturer_id
WHERE p.category_label IS NOT NULL
ORDER BY p.category_label, p.name
```

**Key:** Every component field uses COALESCE(direct_value, child_port_subquery).

**`_seat` ports:** NOT safe to exclude. Mercury Star Runner `turret_top/bottom_seat` have real TurretBase components.

---

## Key Design Decisions

### Clean Slate Import
HangarXplor import does `DELETE` all user_fleet + `INSERT`. No merging or diffing.

### No UNIQUE on user_fleet
Users can own multiple of the same ship (two PTVs, etc.).

### Out-of-Band Columns
`price_auec`, `acquisition_type`, and `acquisition_source_name` on `vehicles` were applied via `wrangler d1 execute`, not via migration files. They exist in production D1 but not in the `.sql` migration sequence.

### Sync History Pattern
All sync operations insert a `sync_history` row at start, update it on completion/failure. `started_at` and `completed_at` use `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` for ISO 8601 UTC.

### Vehicle Count Guard
`runFullSync` checks `getVehicleCount > 0` before syncing. Prevents sync running against empty DB.

### Image Priority
CF Images > RSI new CDN > RSI old CDN > SC Wiki relative path > NULL.

CF Images check: `vehicle_images.cf_images_id IS NOT NULL` — if this exists, no lower-priority image will overwrite it.
