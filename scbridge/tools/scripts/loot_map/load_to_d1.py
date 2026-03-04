"""
Generate SQL to load loot_map.json into D1.

Two-pass approach to stay under D1's SQLITE_MAX_SQL_LENGTH (~1MB):
  Pass 1 (metadata): UPSERT with all columns except JSON blobs (~200 bytes each)
  Pass 2 (json):     UPDATE JSON blob columns per item (~50KB-250KB each)

Usage:
  python3 load_to_d1.py [--json PATH] [--out-dir DIR] [--batch-size N]

  # Load metadata first, then JSON blobs:
  source ~/.secrets
  for f in output_dir/meta_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done
  for f in output_dir/json_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done

Options:
  --json PATH       Path to loot_map.json (default: auto-detect from version)
  --version VER     Game version string (default: 4.6.0-live.11319298)
  --out-dir DIR     Output directory for batch files (default: next to loot_map.json)
  --batch-size N    Metadata statements per batch file (default: 500)
  --meta-only       Only generate metadata UPSERTs (skip JSON blobs)
"""

import argparse
import json
import platform
import sys
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────

DEFAULT_VERSION = "4.6.0-live.11319298"

if platform.system() == "Windows":
    _BASE = Path(r"E:\SC Bridge\Data p4k")
else:
    _BASE = Path("/mnt/e/SC Bridge/Data p4k")


# ── Item type → FK table mapping ─────────────────────────────────────

TYPE_TO_TABLE = {
    "WeaponPersonal": "fps_weapons",
    "WeaponGun": "fps_weapons",
    "Char_Armor_Helmet": "fps_helmets",
    "Char_Armor_Torso": "fps_armour",
    "Char_Armor_Legs": "fps_armour",
    "Char_Armor_Arms": "fps_armour",
    "Char_Armor_Undersuit": "fps_armour",
    "Char_Armor_Backpack": "fps_armour",
    "WeaponAttachment": "fps_attachments",
    "Char_Clothing_Torso_0": "fps_clothing",
    "Char_Clothing_Torso_1": "fps_clothing",
    "Char_Clothing_Legs": "fps_clothing",
    "Char_Clothing_Feet": "fps_clothing",
    "Char_Clothing_Hat": "fps_clothing",
    "Char_Clothing_Hands": "fps_clothing",
    "Char_Clothing_Backpack": "fps_clothing",
    "Food": "consumables",
    "Drink": "consumables",
    "FPS_Consumable": "consumables",
    "Missile": "ship_missiles",
    "PowerPlant": "vehicle_components",
    "Cooler": "vehicle_components",
    "Shield": "vehicle_components",
    "QuantumDrive": "vehicle_components",
    "MissileLauncher": "vehicle_components",
    "Turret": "vehicle_components",
    "MiningModifier": "vehicle_components",
    "Gadget": "fps_utilities",
    "Visor": "fps_utilities",
    "RemovableChip": "fps_utilities",
    "Misc": "props",
    "Usable": "props",
    "AmmoBox": "props",
}

TABLE_TO_FK = {
    "fps_weapons": "fps_weapon_id",
    "fps_helmets": "fps_helmet_id",
    "fps_armour": "fps_armour_id",
    "fps_attachments": "fps_attachment_id",
    "fps_utilities": "fps_utility_id",
    "fps_clothing": "fps_clothing_id",
    "consumables": "consumable_id",
    "harvestables": "harvestable_id",
    "props": "props_id",
    "vehicle_components": "vehicle_component_id",
    "ship_missiles": "ship_missile_id",
}

TABLE_TO_CATEGORY = {
    "fps_weapons": "weapon",
    "fps_helmets": "helmet",
    "fps_armour": "armour",
    "fps_attachments": "attachment",
    "fps_utilities": "utility",
    "fps_clothing": "clothing",
    "consumables": "consumable",
    "harvestables": "harvestable",
    "props": "prop",
    "vehicle_components": "ship_component",
    "ship_missiles": "missile",
}

# Tables that have a manufacturer_id FK for resolving manufacturer_name
TABLES_WITH_MANUFACTURER = {
    "fps_weapons", "fps_armour", "fps_attachments", "fps_utilities",
    "fps_helmets", "fps_clothing", "vehicle_components", "ship_missiles",
}

JSON_COLUMNS = ["containers_json", "npcs_json", "shops_json", "corpses_json", "contracts_json"]
JSON_SOURCE_KEYS = ["containers", "npcs", "shops", "corpses", "contracts"]

# D1's max SQL statement length is ~1MB. Stay well under.
MAX_STMT_BYTES = 800_000


def escape(s: str) -> str:
    """Escape a string for SQLite single-quote literals."""
    return s.replace("'", "''")


def json_dumps_compact(data) -> str:
    """Compact JSON for storage in TEXT columns."""
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


# ── Pass 1: Metadata UPSERT (no JSON blobs) ──────────────────────────

def build_meta_upsert(item_uuid: str, item: dict, version: str,
                      fk_columns: list[str]) -> str:
    """Build a metadata-only UPSERT (no JSON blob columns)."""
    name = item.get("name", "")
    record_name = item.get("recordName", "")
    item_type = item.get("type", "")
    item_sub_type = item.get("subType", "")
    rarity = item.get("rarity", "") or None

    table = TYPE_TO_TABLE.get(item_type)
    fk_col = TABLE_TO_FK.get(table) if table else None
    category = TABLE_TO_CATEGORY.get(table, "unknown") if table else "unknown"

    fk_value = "NULL"
    mfr_subquery = "NULL"
    if fk_col and table:
        fk_value = (
            f"(SELECT id FROM {table} WHERE uuid = '{item_uuid}' "
            f"AND game_version_id = (SELECT id FROM game_versions WHERE code = '{version}'))"
        )
        if table in TABLES_WITH_MANUFACTURER:
            mfr_subquery = (
                f"(SELECT m.name FROM {table} t "
                f"JOIN manufacturers m ON m.id = t.manufacturer_id "
                f"WHERE t.uuid = '{item_uuid}' "
                f"AND t.game_version_id = (SELECT id FROM game_versions WHERE code = '{version}'))"
            )

    rarity_sql = f"'{escape(rarity)}'" if rarity else "NULL"
    name_sql = f"'{escape(name)}'"
    class_name_sql = f"'{escape(record_name)}'" if record_name else "NULL"
    type_sql = f"'{escape(item_type)}'" if item_type else "NULL"
    sub_type_sql = f"'{escape(item_sub_type)}'" if item_sub_type else "NULL"
    category_sql = f"'{escape(category)}'"

    fk_values = []
    for col in fk_columns:
        fk_values.append(fk_value if col == fk_col else "NULL")

    fk_cols_str = ", ".join(fk_columns)
    fk_vals_str = ", ".join(fk_values)

    sql = (
        f"INSERT INTO loot_map "
        f"(uuid, name, class_name, type, sub_type, rarity, category, manufacturer_name, "
        f"{fk_cols_str}, game_version_id, updated_at) "
        f"VALUES ("
        f"'{item_uuid}', {name_sql}, {class_name_sql}, {type_sql}, {sub_type_sql}, "
        f"{rarity_sql}, {category_sql}, {mfr_subquery}, "
        f"{fk_vals_str}, "
        f"(SELECT id FROM game_versions WHERE code = '{version}'), "
        f"datetime('now')"
        f") ON CONFLICT (uuid, game_version_id) DO UPDATE SET "
        f"name = excluded.name, "
        f"class_name = excluded.class_name, "
        f"type = excluded.type, "
        f"sub_type = excluded.sub_type, "
        f"rarity = excluded.rarity, "
        f"category = excluded.category, "
        f"manufacturer_name = excluded.manufacturer_name, "
        + ", ".join(f"{col} = excluded.{col}" for col in fk_columns)
        + ", updated_at = excluded.updated_at;"
    )

    return sql, fk_col is not None, rarity is not None


# ── Pass 2: JSON blob UPDATEs ─────────────────────────────────────────

def build_json_updates(item_uuid: str, item: dict, version: str) -> list[str]:
    """Build UPDATE statements for JSON blob columns.

    Returns one statement per column (or a combined statement if total size
    is under MAX_STMT_BYTES). Skips empty/null blobs.
    """
    version_subquery = f"(SELECT id FROM game_versions WHERE code = '{version}')"
    where = f"WHERE uuid = '{item_uuid}' AND game_version_id = {version_subquery}"

    # Collect non-empty blobs with their sizes
    blobs: list[tuple[str, str]] = []  # (column_name, escaped_json)
    for col, key in zip(JSON_COLUMNS, JSON_SOURCE_KEYS):
        data = item.get(key, [])
        if data:
            blob_json = json_dumps_compact(data)
            blobs.append((col, escape(blob_json)))

    if not blobs:
        return []

    # Try combined UPDATE first
    set_parts = [f"{col} = '{val}'" for col, val in blobs]
    combined = f"UPDATE loot_map SET {', '.join(set_parts)} {where};"
    if len(combined.encode()) < MAX_STMT_BYTES:
        return [combined]

    # Too large — split into one UPDATE per column
    stmts = []
    for col, val in blobs:
        stmt = f"UPDATE loot_map SET {col} = '{val}' {where};"
        if len(stmt.encode()) >= MAX_STMT_BYTES:
            # Individual column still too large — skip with warning
            name = item.get("name", item_uuid)
            print(f"  WARNING: {col} for '{name}' is {len(stmt.encode()):,} bytes "
                  f"(>{MAX_STMT_BYTES:,}), skipping", file=sys.stderr)
            continue
        stmts.append(stmt)

    return stmts


# ── Batch writer ──────────────────────────────────────────────────────

def write_batches(stmts: list[str], out_dir: Path, prefix: str,
                  batch_size: int, version: str, header_extra: str = "") -> int:
    """Write statements into numbered batch files. Returns batch count."""
    batch_num = 0
    for i in range(0, len(stmts), batch_size):
        batch_num += 1
        batch = stmts[i:i + batch_size]
        fname = f"{prefix}_{batch_num:03d}.sql"
        fpath = out_dir / fname
        with open(fpath, "w") as f:
            f.write(f"-- {prefix} batch {batch_num} ({len(batch)} statements)\n")
            f.write(f"-- Game version: {version}\n")
            if header_extra:
                f.write(f"-- {header_extra}\n")
            f.write("\n")
            f.write("\n".join(batch))
            f.write("\n")
        size_kb = fpath.stat().st_size / 1024
        print(f"  {fname}: {len(batch)} stmts, {size_kb:.0f} KB", file=sys.stderr)
    return batch_num


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate loot_map D1 SQL (two-pass: metadata + JSON blobs)")
    parser.add_argument("--json", type=str, help="Path to loot_map.json")
    parser.add_argument("--version", type=str, default=DEFAULT_VERSION,
                        help="Game version code")
    parser.add_argument("--out-dir", type=str,
                        help="Output directory for batch files")
    parser.add_argument("--batch-size", type=int, default=500,
                        help="Metadata statements per batch (default: 500)")
    parser.add_argument("--meta-only", action="store_true",
                        help="Only generate metadata UPSERTs (skip JSON blobs)")
    args = parser.parse_args()

    json_path = args.json or str(_BASE / args.version / "Resolved" / "loot_map.json")
    if not Path(json_path).exists():
        print(f"ERROR: loot_map.json not found at {json_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out_dir) if args.out_dir else Path(json_path).parent / "d1_batches"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {json_path}", file=sys.stderr)
    with open(json_path) as f:
        data = json.load(f)

    items = data["items"]
    print(f"{len(items)} items in loot_map.json", file=sys.stderr)

    fk_columns = list(TABLE_TO_FK.values())
    sorted_items = sorted(items.items(), key=lambda x: x[1]["name"])

    # ── Pass 1: Metadata UPSERTs ──────────────────────────────────────
    print(f"\n=== Pass 1: Metadata UPSERTs ===", file=sys.stderr)
    meta_stmts: list[str] = []
    stats = {"total": 0, "with_fk": 0, "no_fk": 0, "rarity_set": 0}

    for item_uuid, item in sorted_items:
        sql, has_fk, has_rarity = build_meta_upsert(
            item_uuid, item, args.version, fk_columns)
        meta_stmts.append(sql)
        stats["total"] += 1
        if has_fk:
            stats["with_fk"] += 1
        else:
            stats["no_fk"] += 1
        if has_rarity:
            stats["rarity_set"] += 1

    # Append placeholder cleanup to metadata
    meta_stmts.append(
        "UPDATE loot_map SET manufacturer_name = NULL\n"
        "  WHERE manufacturer_name IN ('<= PLACEHOLDER =>', '987')\n"
        "     OR manufacturer_name LIKE '@%';"
    )

    meta_batches = write_batches(
        meta_stmts, out_dir, "meta", args.batch_size, args.version)

    print(f"\n  {stats['total']} items → {meta_batches} meta batches", file=sys.stderr)
    print(f"  With FK: {stats['with_fk']}", file=sys.stderr)
    print(f"  No FK (unknown category): {stats['no_fk']}", file=sys.stderr)
    print(f"  Rarity set: {stats['rarity_set']}", file=sys.stderr)

    # ── Pass 2: JSON blob UPDATEs ─────────────────────────────────────
    if args.meta_only:
        print(f"\n--meta-only: skipping JSON blob pass", file=sys.stderr)
    else:
        print(f"\n=== Pass 2: JSON blob UPDATEs ===", file=sys.stderr)
        json_stmts: list[str] = []
        json_items = 0
        json_skipped = 0

        for item_uuid, item in sorted_items:
            updates = build_json_updates(item_uuid, item, args.version)
            if updates:
                json_items += 1
                json_stmts.extend(updates)

        # JSON statements are larger — use smaller batch sizes.
        # Target ~800KB per batch file.
        json_batch_stmts: list[list[str]] = [[]]
        current_size = 0
        for stmt in json_stmts:
            stmt_size = len(stmt.encode())
            if current_size + stmt_size > MAX_STMT_BYTES and json_batch_stmts[-1]:
                json_batch_stmts.append([])
                current_size = 0
            json_batch_stmts[-1].append(stmt)
            current_size += stmt_size

        json_batch_count = 0
        for batch in json_batch_stmts:
            if not batch:
                continue
            json_batch_count += 1
            fname = f"json_{json_batch_count:03d}.sql"
            fpath = out_dir / fname
            with open(fpath, "w") as f:
                f.write(f"-- json blob batch {json_batch_count} "
                        f"({len(batch)} statements)\n")
                f.write(f"-- Game version: {args.version}\n\n")
                f.write("\n".join(batch))
                f.write("\n")
            size_kb = fpath.stat().st_size / 1024
            print(f"  {fname}: {len(batch)} stmts, {size_kb:.0f} KB", file=sys.stderr)

        print(f"\n  {json_items} items with JSON → "
              f"{json_batch_count} json batches "
              f"({len(json_stmts)} statements)", file=sys.stderr)

    # ── Usage instructions ────────────────────────────────────────────
    print(f"\nTo load into D1:", file=sys.stderr)
    print(f"  source ~/.secrets", file=sys.stderr)
    print(f"  # Pass 1: metadata", file=sys.stderr)
    print(f"  for f in {out_dir}/meta_*.sql; do", file=sys.stderr)
    print(f'    echo "Loading $f..." && npx wrangler d1 execute '
          f'sc-companion --remote --file="$f"', file=sys.stderr)
    print(f"  done", file=sys.stderr)
    if not args.meta_only:
        print(f"  # Pass 2: JSON blobs", file=sys.stderr)
        print(f"  for f in {out_dir}/json_*.sql; do", file=sys.stderr)
        print(f'    echo "Loading $f..." && npx wrangler d1 execute '
              f'sc-companion --remote --file="$f"', file=sys.stderr)
        print(f"  done", file=sys.stderr)


if __name__ == "__main__":
    main()
