#!/usr/bin/env python3
"""
Load delta_loot_map.json into D1 — only changed items for the new version.

Reads the output of version_delta.py and generates SQL batch files that:
  - INSERT new rows for added/modified items (with new game_version_id)
  - INSERT tombstone rows (removed=1) for removed items
  - Unchanged items are NOT touched — the "latest as of" query resolves them
    from their original game_version_id

Two-pass approach (same as load_to_d1.py) to stay under SQLITE_MAX_SQL_LENGTH:
  Pass 1 (metadata): INSERT with all columns except JSON blobs
  Pass 2 (json):     UPDATE JSON blob columns per item

Usage:
  python3 load_delta_to_d1.py --old 4.6.0-live.11319298 --new 4.6.0-live.11377160

  # Then load into D1:
  source ~/.secrets
  for f in output_dir/delta_meta_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done
  for f in output_dir/delta_json_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done
"""

import argparse
import json
import platform
import sys
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    DATA_ROOT = Path(r"E:\SC Bridge\Data p4k")
else:
    DATA_ROOT = Path("/mnt/e/SC Bridge/Data p4k")


# ── Item type → FK table mapping (same as load_to_d1.py) ─────────────

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

TABLES_WITH_MANUFACTURER = {
    "fps_weapons", "fps_armour", "fps_attachments", "fps_utilities",
    "fps_helmets", "fps_clothing", "vehicle_components", "ship_missiles",
}

JSON_COLUMNS = ["containers_json", "npcs_json", "shops_json", "corpses_json", "contracts_json"]
JSON_SOURCE_KEYS = ["containers", "npcs", "shops", "corpses", "contracts"]

MAX_STMT_BYTES = 800_000


def escape(s: str) -> str:
    """Escape a string for SQLite single-quote literals."""
    return s.replace("'", "''")


def json_compact(data) -> str:
    """Compact JSON for TEXT columns."""
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


# ── SQL builders ──────────────────────────────────────────────────────

def build_meta_insert(item_uuid: str, item: dict, version: str,
                      fk_columns: list[str], removed: int = 0) -> str:
    """Build a metadata-only INSERT for a delta item (no JSON blobs)."""
    name = item.get("name", "")
    record_name = item.get("recordName", "")
    item_type = item.get("type", "")
    item_sub_type = item.get("subType", "")
    rarity = item.get("rarity", "") or None

    table = TYPE_TO_TABLE.get(item_type)
    fk_col = TABLE_TO_FK.get(table) if table else None
    category = TABLE_TO_CATEGORY.get(table, "unknown") if table else "unknown"

    # FK subquery resolves against the NEW version's reference tables
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
        f"{fk_cols_str}, game_version_id, removed, updated_at) "
        f"VALUES ("
        f"'{item_uuid}', {name_sql}, {class_name_sql}, {type_sql}, {sub_type_sql}, "
        f"{rarity_sql}, {category_sql}, {mfr_subquery}, "
        f"{fk_vals_str}, "
        f"(SELECT id FROM game_versions WHERE code = '{version}'), "
        f"{removed}, "
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
        + f", removed = excluded.removed"
        + ", updated_at = excluded.updated_at;"
    )

    return sql


def build_tombstone(item_uuid: str, name: str, version: str) -> str:
    """Build a tombstone INSERT for a removed item."""
    name_sql = f"'{escape(name)}'" if name else "NULL"
    return (
        f"INSERT INTO loot_map (uuid, name, game_version_id, removed, updated_at) "
        f"VALUES ("
        f"'{item_uuid}', {name_sql}, "
        f"(SELECT id FROM game_versions WHERE code = '{version}'), "
        f"1, datetime('now')"
        f") ON CONFLICT (uuid, game_version_id) DO UPDATE SET "
        f"removed = 1, updated_at = excluded.updated_at;"
    )


def build_json_updates(item_uuid: str, item: dict, version: str) -> list[str]:
    """Build UPDATE statements for JSON blob columns."""
    version_sub = f"(SELECT id FROM game_versions WHERE code = '{version}')"
    where = f"WHERE uuid = '{item_uuid}' AND game_version_id = {version_sub}"

    blobs: list[tuple[str, str]] = []
    for col, key in zip(JSON_COLUMNS, JSON_SOURCE_KEYS):
        data = item.get(key, [])
        if data:
            blobs.append((col, escape(json_compact(data))))

    if not blobs:
        return []

    # Try combined UPDATE
    set_parts = [f"{col} = '{val}'" for col, val in blobs]
    combined = f"UPDATE loot_map SET {', '.join(set_parts)} {where};"
    if len(combined.encode()) < MAX_STMT_BYTES:
        return [combined]

    # Split per column
    stmts = []
    for col, val in blobs:
        stmt = f"UPDATE loot_map SET {col} = '{val}' {where};"
        if len(stmt.encode()) >= MAX_STMT_BYTES:
            name = item.get("name", item_uuid)
            print(f"  WARNING: {col} for '{name}' is {len(stmt.encode()):,} bytes, skipping",
                  file=sys.stderr)
            continue
        stmts.append(stmt)
    return stmts


# ── Batch writer ──────────────────────────────────────────────────────

def write_batches(stmts: list[str], out_dir: Path, prefix: str,
                  batch_size: int, version: str) -> int:
    """Write statements into numbered batch files. Returns batch count."""
    if not stmts:
        return 0
    batch_num = 0
    for i in range(0, len(stmts), batch_size):
        batch_num += 1
        batch = stmts[i:i + batch_size]
        fname = f"{prefix}_{batch_num:03d}.sql"
        fpath = out_dir / fname
        with open(fpath, "w") as f:
            f.write(f"-- {prefix} batch {batch_num} ({len(batch)} statements)\n")
            f.write(f"-- Game version: {version} (delta)\n\n")
            f.write("\n".join(batch))
            f.write("\n")
        size_kb = fpath.stat().st_size / 1024
        print(f"  {fname}: {len(batch)} stmts, {size_kb:.0f} KB")
    return batch_num


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Load delta_loot_map.json into D1 (only changed items)")
    parser.add_argument("--old", type=str, required=True,
                        help="Old version code (for reference)")
    parser.add_argument("--new", type=str, required=True,
                        help="New version code to load")
    parser.add_argument("--delta-json", type=str,
                        help="Path to delta_loot_map.json (default: auto)")
    parser.add_argument("--out-dir", type=str,
                        help="Output directory for batch files")
    parser.add_argument("--batch-size", type=int, default=500,
                        help="Metadata statements per batch (default: 500)")
    parser.add_argument("--register-version", action="store_true",
                        help="Prepend game_versions INSERT for the new version")
    parser.add_argument("--meta-only", action="store_true",
                        help="Only generate metadata INSERTs (skip JSON blobs)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print summary without writing files")
    args = parser.parse_args()

    delta_path = (
        Path(args.delta_json) if args.delta_json
        else DATA_ROOT / args.new / "Resolved" / "delta_loot_map.json"
    )

    if not delta_path.exists():
        print(f"ERROR: delta_loot_map.json not found: {delta_path}")
        print(f"  Run: python version_delta.py --old {args.old} --new {args.new}")
        sys.exit(1)

    out_dir = Path(args.out_dir) if args.out_dir else delta_path.parent / "d1_delta_batches"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Delta Loot Map D1 Loader")
    print(f"  Old: {args.old}")
    print(f"  New: {args.new}")
    print(f"  Delta: {delta_path}")
    print("=" * 60)

    with open(delta_path) as f:
        delta = json.load(f)

    added = delta["items"]["added"]
    modified = delta["items"]["modified"]
    removed = delta["items"]["removed"]
    summary = delta["summary"]

    total_changes = len(added) + len(modified) + len(removed)

    print(f"\nDelta summary:")
    print(f"  Unchanged: {summary['unchanged']:,} (not touched)")
    print(f"  Modified:  {len(modified):,}")
    print(f"  Added:     {len(added):,}")
    print(f"  Removed:   {len(removed):,}")
    print(f"  Total rows to insert: {total_changes}")

    if total_changes == 0:
        print("\nNo changes — nothing to load.")
        if args.register_version:
            print("(Use --register-version alone to just register the version)")
        sys.exit(0)

    if args.dry_run:
        print("\n--dry-run: stopping here.")
        sys.exit(0)

    fk_columns = list(TABLE_TO_FK.values())
    version = args.new

    # ── Pass 1: Metadata INSERTs ──────────────────────────────────────
    print(f"\n=== Pass 1: Metadata INSERTs ===")
    meta_stmts: list[str] = []

    # Optionally register the new game version
    if args.register_version:
        # Extract patch components from version code like "4.6.0-live.11377160"
        parts = version.split(".")
        if len(parts) >= 3:
            major = parts[0]
            minor = parts[1]
            patch_num = parts[2].split("-")[0]
            channel = "LIVE" if "live" in version.lower() else "PTU"
            label = f"Alpha {major}.{minor}.{patch_num} {channel}"
        else:
            label = version

        meta_stmts.append(
            f"INSERT INTO game_versions (code, label, channel, is_default) "
            f"VALUES ('{escape(version)}', '{escape(label)}', "
            f"'{escape(channel if 'channel' in dir() else 'LIVE')}', 0) "
            f"ON CONFLICT (code) DO NOTHING;"
        )
        print(f"  Will register version: {version} ({label})")

    # Added items — full INSERT
    for item_uuid in sorted(added.keys()):
        item = added[item_uuid]
        sql = build_meta_insert(item_uuid, item, version, fk_columns, removed=0)
        meta_stmts.append(sql)

    # Modified items — INSERT new row with updated data
    for item_uuid in sorted(modified.keys()):
        entry = modified[item_uuid]
        item = entry["item"]
        sql = build_meta_insert(item_uuid, item, version, fk_columns, removed=0)
        meta_stmts.append(sql)

    # Removed items — tombstone INSERT
    # We need the old loot_map to get the item name for tombstones
    if removed:
        old_loot_path = DATA_ROOT / args.old / "Resolved" / "loot_map.json"
        old_names: dict[str, str] = {}
        if old_loot_path.exists():
            with open(old_loot_path) as f:
                old_data = json.load(f)
            for uuid in removed:
                old_item = old_data["items"].get(uuid, {})
                old_names[uuid] = old_item.get("name", "")

        for item_uuid in sorted(removed):
            sql = build_tombstone(item_uuid, old_names.get(item_uuid, ""), version)
            meta_stmts.append(sql)

    meta_batches = write_batches(meta_stmts, out_dir, "delta_meta", args.batch_size, version)
    print(f"\n  {len(meta_stmts)} statements → {meta_batches} meta batch(es)")

    # ── Pass 2: JSON blob UPDATEs ─────────────────────────────────────
    if args.meta_only:
        print(f"\n--meta-only: skipping JSON blob pass")
    else:
        print(f"\n=== Pass 2: JSON blob UPDATEs ===")
        json_stmts: list[str] = []

        # Added items
        for item_uuid in sorted(added.keys()):
            item = added[item_uuid]
            json_stmts.extend(build_json_updates(item_uuid, item, version))

        # Modified items
        for item_uuid in sorted(modified.keys()):
            entry = modified[item_uuid]
            item = entry["item"]
            json_stmts.extend(build_json_updates(item_uuid, item, version))

        # No JSON for tombstones

        if json_stmts:
            # Size-aware batching for JSON blobs
            json_batch_groups: list[list[str]] = [[]]
            current_size = 0
            for stmt in json_stmts:
                stmt_size = len(stmt.encode())
                if current_size + stmt_size > MAX_STMT_BYTES and json_batch_groups[-1]:
                    json_batch_groups.append([])
                    current_size = 0
                json_batch_groups[-1].append(stmt)
                current_size += stmt_size

            json_batch_count = 0
            for batch in json_batch_groups:
                if not batch:
                    continue
                json_batch_count += 1
                fname = f"delta_json_{json_batch_count:03d}.sql"
                fpath = out_dir / fname
                with open(fpath, "w") as f:
                    f.write(f"-- delta json blob batch {json_batch_count} "
                            f"({len(batch)} statements)\n")
                    f.write(f"-- Game version: {version} (delta)\n\n")
                    f.write("\n".join(batch))
                    f.write("\n")
                size_kb = fpath.stat().st_size / 1024
                print(f"  {fname}: {len(batch)} stmts, {size_kb:.0f} KB")

            print(f"\n  {len(json_stmts)} JSON statements → {json_batch_count} batch(es)")
        else:
            print(f"  No JSON blobs to update")

    # ── Usage instructions ────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print(f"To load into D1:")
    print(f"  source ~/.secrets")
    print(f"  # Pass 1: metadata")
    print(f"  for f in {out_dir}/delta_meta_*.sql; do")
    print(f'    echo "Loading $f..." && npx wrangler d1 execute '
          f'sc-companion --remote --file="$f"')
    print(f"  done")
    if not args.meta_only:
        print(f"  # Pass 2: JSON blobs")
        print(f"  for f in {out_dir}/delta_json_*.sql; do")
        print(f'    echo "Loading $f..." && npx wrangler d1 execute '
              f'sc-companion --remote --file="$f"')
        print(f"  done")


if __name__ == "__main__":
    main()
