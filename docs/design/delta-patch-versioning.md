# Delta Patch Versioning Design

## Problem

When a new Star Citizen patch drops (e.g. 4.6.0 -> 4.7.0), the current system would
duplicate ALL ~5,300 loot items (and all 15 versioned tables) even though most items
haven't changed. This wastes storage, makes history meaningless (every row looks "new"),
and doesn't let us answer "what actually changed in this patch?"

## Goal

- Only insert new DB rows for items that **actually changed** between patches
- Queries resolve the **latest version of each item** up to the selected patch
- A weapon unchanged since 4.6.0 still appears when viewing 4.8.0 data
- Full file-level diff of DataCore shows everything that changed (discovery tool)
- Resolved-level diff drives the actual DB delta (operational tool)

## Architecture Overview

```
LOCAL (WSL/Windows)                           CLOUDFLARE (D1 + Worker)
========================                      ========================

 Data.p4k                                     game_versions table
    |                                              |
    v                                              v
 extract_all.py --version X                   "latest as of" queries
    |                                         (MAX game_version_id per uuid)
    v                                              ^
 DataCore JSONs (55K files)                        |
    |                                              |
    +---> datacore_diff.py (discovery)             |
    |     compare old vs new DataCore              |
    |     outputs: diff report + change map        |
    |                                              |
    v                                              |
 build_loot_map.py --version X                     |
    |                                              |
    v                                              |
 loot_map.json (5300 items)                        |
    |                                              |
    +---> version_delta.py                         |
    |     compare old vs new loot_map.json         |
    |     outputs: delta_loot_map.json             |
    |              delta_report.md                 |
    |                                              |
    v                                              |
 load_delta_to_d1.py                               |
    |     INSERT only changed/new items    ------->|
    |     with new game_version_id                 |
    v                                              |
 Admin UI: set default version  ------------------>|
```

## Phase 1: DataCore Diff (Local Discovery Tool)

### Purpose
Show everything that changed between two DataCore extractions at the raw file level.
This is an exploration/discovery tool — it reveals changes we might not be capturing yet.

### Script: `scbridge/tools/scripts/datacore_diff.py`

```
python datacore_diff.py --old 4.6.0-live.11319298 --new 4.7.0-live.NNNNNNN
```

### What It Does

1. Walk both DataCore `libs/foundry/records/` trees
2. Hash each JSON file (SHA-256 of normalized content)
3. Classify every file as: `unchanged`, `modified`, `added`, `removed`
4. Output structured report

### Output: `{new_version}/Resolved/datacore_diff.json`

```json
{
  "old_version": "4.6.0-live.11319298",
  "new_version": "4.7.0-live.NNNNNNN",
  "summary": {
    "total_old": 55382,
    "total_new": 55500,
    "unchanged": 54800,
    "modified": 450,
    "added": 150,
    "removed": 32
  },
  "by_category": {
    "entities/scitem/ships": { "modified": 12, "added": 3, "removed": 0 },
    "lootgeneration": { "modified": 85, "added": 5, "removed": 2 },
    "entities/scitem/fps_weapons": { "modified": 15, "added": 8, "removed": 0 }
  },
  "files": {
    "modified": [
      {
        "path": "entities/scitem/fps_weapons/volt_rifle_energy_01.json",
        "category": "entities/scitem/fps_weapons",
        "diff_keys": ["Components.SAttachableComponentParams.AttachDef.Loadout"]
      }
    ],
    "added": [...],
    "removed": [...]
  }
}
```

### Output: `{new_version}/Resolved/datacore_diff.md`

Human-readable summary grouped by category, showing what changed and what's new.
Designed to be read after each patch to discover:
- New item categories we're not capturing
- Changes to loot tables
- New ships/vehicles
- Removed content

### Implementation Approach

```python
def hash_json_file(path):
    """Normalize and hash a DataCore JSON for comparison."""
    with open(path) as f:
        data = json.load(f)
    # Normalize: sorted keys, no whitespace variance
    canonical = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()

def diff_key_changes(old_path, new_path):
    """For modified files, identify which top-level keys changed."""
    old = json.load(open(old_path))
    new = json.load(open(new_path))
    changed = []
    for key in set(list(old.keys()) + list(new.keys())):
        old_val = json.dumps(old.get(key), sort_keys=True)
        new_val = json.dumps(new.get(key), sort_keys=True)
        if old_val != new_val:
            changed.append(key)
    return changed
```

**Performance note:** Hashing 55K JSON files over WSL drvfs is slow (~5 min).
Optimization: cache hashes in `{version}/.file_hashes.json` after first run.
Second run for same version is instant.


## Phase 2: Resolved Delta (Operational Tool)

### Purpose
Compare two `loot_map.json` files and produce a delta containing only items that
changed. This drives the actual D1 database update.

### Script: `scbridge/tools/scripts/version_delta.py`

```
python version_delta.py --old 4.6.0-live.11319298 --new 4.7.0-live.NNNNNNN
```

### What It Compares (per item UUID)

| Field | Compared? | Notes |
|-------|-----------|-------|
| `name` | Yes | Display name changed |
| `type` | Yes | Category changed |
| `subType` | Yes | Sub-category changed |
| `rarity` | Yes | Rarity tier changed |
| `containers` | Yes | Loot locations/probabilities changed |
| `npcs` | Yes | NPC drop sources changed |
| `shops` | Yes | Shop availability/prices changed |
| `corpses` | Yes | Corpse loot changed |
| `contracts` | Yes | Contract rewards changed |
| `recordName` | Yes | Internal record reference changed |

Comparison is done on normalized JSON — order-independent for arrays (sorted by
a stable key like `location` for containers, `actor` for NPCs, `shop` for shops).

### Output: `{new_version}/Resolved/delta_loot_map.json`

```json
{
  "old_version": "4.6.0-live.11319298",
  "new_version": "4.7.0-live.NNNNNNN",
  "summary": {
    "total_old": 5294,
    "total_new": 5350,
    "unchanged": 4900,
    "modified": 350,
    "added": 100,
    "removed": 44
  },
  "items": {
    "added": {
      "uuid-1": { "name": "New Weapon", "type": "WeaponGun", ... },
      ...
    },
    "modified": {
      "uuid-2": {
        "item": { "name": "Existing Gun", "type": "WeaponGun", ... },
        "changes": ["rarity", "containers", "shops"]
      },
      ...
    },
    "removed": ["uuid-3", "uuid-4", ...]
  }
}
```

### Output: `{new_version}/Resolved/delta_report.md`

Human-readable patch notes:
- New items added (grouped by type)
- Items with changed rarity
- Items with new/removed shop availability
- Items with changed loot locations
- Removed items

This becomes a "what's new in this patch" summary for the website.


## Phase 3: Delta D1 Loader (Operational Tool)

### Script: `scbridge/tools/scripts/load_delta_to_d1.py`

```
python load_delta_to_d1.py --version 4.7.0-live.NNNNNNN [--dry-run]
```

### What It Does

1. Read `delta_loot_map.json` for the target version
2. Register the new game version in `game_versions` table (if not exists)
3. For each **added** or **modified** item:
   - INSERT a new `loot_map` row with `game_version_id` = new version
   - INSERT corresponding item table rows (fps_weapons, vehicle_components, etc.)
     only if that item's detail data also changed
4. For **removed** items: do nothing (they simply won't have a row for the new version,
   so the "latest as of" query will return the previous version's row, which is correct
   — the item existed in the old patch but not the new one)

### Handling Removed Items

Removed items need special treatment. If an item existed in 4.6.0 but is gone in 4.7.0,
the "latest as of 4.7.0" query would still return the 4.6.0 row (wrong — item doesn't
exist in 4.7.0).

**Solution: Tombstone rows.** Insert a row with `game_version_id` = new version and a
`removed INTEGER DEFAULT 0` flag set to 1. The query filters these out.

```sql
-- Migration adds: ALTER TABLE loot_map ADD COLUMN removed INTEGER DEFAULT 0;
-- (Applied via rebuild pattern per DB conventions)
```

### Handling Detail Tables

The 15 versioned tables fall into two categories:

**Loot-map-driven** (change when loot data changes):
- `loot_map` — always gets delta rows (this is the primary delta target)

**Item-detail-driven** (change when item stats/properties change):
- `vehicle_components`, `fps_weapons`, `fps_armour`, `fps_attachments`
- `fps_utilities`, `fps_helmets`, `fps_clothing`
- `consumables`, `harvestables`, `props`
- `manufacturers`, `vehicles`, `vehicle_ports`, `contracts`

For the item detail tables, the DataCore diff (Phase 1) tells us which items changed.
Cross-reference the changed DataCore files with item UUIDs to determine which detail
rows need new version entries.

### Batch Size

Use the same D1 batch approach as the current loader. Changed items are typically
<500 per patch (vs 5300 total), so batches will be small and well within D1 limits.


## Phase 4: "Latest As Of" Queries (Cloudflare Worker)

### Current Query Pattern (exact version match)

```sql
-- Only returns items with rows for exactly this version
WHERE lm.game_version_id = (SELECT id FROM game_versions WHERE code = ?)
```

### New Query Pattern (latest as of version)

```sql
-- Returns the most recent row for each item, up to the target version
SELECT lm.*
FROM loot_map lm
INNER JOIN (
  SELECT uuid, MAX(game_version_id) as latest_gv
  FROM loot_map
  WHERE game_version_id <= (SELECT id FROM game_versions WHERE code = ?)
    AND removed = 0
  GROUP BY uuid
) latest ON lm.uuid = latest.uuid AND lm.game_version_id = latest.latest_gv
WHERE lm.removed = 0
```

### Why This Works

- `game_versions.id` is AUTOINCREMENT — later patches always have higher IDs
- `MAX(game_version_id)` per uuid gives the most recent row that exists at or before
  the target version
- An item unchanged since 4.6.0 has `game_version_id = 1` (the 4.6.0 row)
- Viewing patch 4.8.0 (id=3): `MAX(gv_id) WHERE gv_id <= 3` returns `1` for that item
- An item changed in 4.7.0 returns `2` (the 4.7.0 row)
- A removed item has `removed = 1` in its latest row, filtered out

### Performance

The inner subquery (`GROUP BY uuid` with `MAX`) is efficient with the existing
`idx_loot_map_game_version` index. For ~5300 items across 2-3 versions, this is
sub-millisecond on D1.

Add a composite index for optimal performance:

```sql
CREATE INDEX idx_loot_map_uuid_gv ON loot_map(uuid, game_version_id);
```

### Affected Functions in `queries.ts`

| Function | Change |
|----------|--------|
| `getLootItems()` | Replace `WHERE game_version_id = X` with latest-as-of JOIN |
| `getLootByUuid()` | Same pattern for single-item lookup |
| `lootBaseWhere()` | Rewrite to use latest-as-of subquery |
| `getLootLocationSummary()` | Same pattern |
| `getLootLocationDetail()` | Same pattern |
| `getGameVersions()` | No change (already works) |

### Detail Table Lookups

`getLootByUuid()` currently does FK lookups like:
```sql
SELECT ... FROM fps_weapons WHERE id = ?
```

These use integer IDs that are stable per-row. Since delta loading creates NEW rows
with new IDs (not updating existing ones), the `loot_map.fps_weapon_id` FK in each
row already points to the correct version of the detail item. No change needed for
these lookups — they follow the FK chain correctly.


## Phase 5: Extending Beyond Loot

The same delta pattern works for all 15 versioned tables. Priority order:

1. **loot_map** (Phase 1-4 above) — highest value, most data, most queries
2. **vehicles** — ship stats change between patches, users want to compare
3. **vehicle_components** — component stats change, affects loadout planning
4. **contracts** — rewards and availability change per patch
5. **Everything else** — fps_weapons, fps_armour, etc. (details follow from loot)

For vehicles and components, the delta source is the DataCore diff (Phase 1) rather
than `loot_map.json`. The same pattern applies:
- Compare old vs new DataCore entity JSONs
- Only INSERT rows for changed items
- Query with "latest as of" pattern


## Implementation Order

### Step 1: DataCore diff tool (local)
- `scbridge/tools/scripts/datacore_diff.py`
- Hash cache for performance
- JSON + markdown output
- Immediate value: see what changed in any patch

### Step 2: Resolved delta tool (local)
- `scbridge/tools/scripts/version_delta.py`
- Compare two `loot_map.json` files
- JSON + markdown output (patch notes)

### Step 3: Migration + query changes (Cloudflare)
- Add `removed` column to `loot_map` (and other versioned tables)
- Add `idx_loot_map_uuid_gv` composite index
- Rewrite `lootBaseWhere()` and all loot query functions
- Test with existing single-version data (should behave identically)

### Step 4: Delta D1 loader (local)
- `scbridge/tools/scripts/load_delta_to_d1.py`
- Reads `delta_loot_map.json`, generates minimal SQL
- Registers new game_version, inserts only changed rows

### Step 5: End-to-end test
- Extract new patch DataCore (you already have 4.6.0-live.11377160 Data.p4k ready)
- Run `build_loot_map.py --version 4.6.0-live.11377160`
- Run `version_delta.py` to get delta
- Run `load_delta_to_d1.py` to load
- Verify frontend shows correct data for both versions


## File Inventory

### New Files

| File | Location | Purpose |
|------|----------|---------|
| `datacore_diff.py` | `scbridge/tools/scripts/` | DataCore file-level diff (discovery) |
| `version_delta.py` | `scbridge/tools/scripts/` | Resolved loot_map diff (operational) |
| `load_delta_to_d1.py` | `scbridge/tools/scripts/` | Delta-only D1 loader |
| `0049_delta_versioning.sql` | `src/db/migrations/` | Add `removed` column + composite index |

### Modified Files

| File | Change |
|------|--------|
| `src/db/queries.ts` | Rewrite loot queries to "latest as of" pattern |
| `build_loot_map.py` | No changes needed (already version-aware) |
| `extract_all.py` | No changes needed (already version-aware) |


## Edge Cases

### First load (bootstrap)
When `game_versions` has only one entry, the "latest as of" query degenerates to
exact match — identical behavior to current system. No special case needed.

### Hotfix patches (same major version)
4.6.0-live.11319298 -> 4.6.0-live.11377160 are hotfixes within the same major.
The delta system handles these identically to major patches — only changed items
get new rows.

### Item UUID reuse across patches
CIG occasionally reuses UUIDs when refactoring items. The delta comparison uses
the full item data (not just UUID), so a reused UUID with different data is correctly
detected as "modified."

### Rollback
If a patch is reverted, set `is_default` back to the previous version. All queries
will resolve to the correct historical data since no rows were deleted.
