"""
Generate SQL to load loot_map.json into D1.

Reads the JSON output from build_loot_map.py and generates SQL UPSERT
statements for the loot_map table. Resolves FK IDs by matching item UUIDs
against existing item tables, and populates the denormalized manufacturer_name
and category columns.

Output is split into batch files to stay under D1's limits.

Usage:
  python3 load_to_d1.py [--json PATH] [--out-dir DIR] [--batch-size N]
  # Then run each batch:
  source ~/.secrets
  for f in output_dir/batch_*.sql; do
    npx wrangler d1 execute sc-companion --remote --file="$f"
  done

Options:
  --json PATH       Path to loot_map.json (default: auto-detect from version)
  --version VER     Game version string (default: 4.6.0-live.11319298)
  --out-dir DIR     Output directory for batch files (default: next to loot_map.json)
  --batch-size N    Statements per batch file (default: 100)
"""

import argparse
import json
import os
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


def escape(s: str) -> str:
    """Escape a string for SQLite single-quote literals."""
    return s.replace("'", "''")


def json_dumps_compact(data) -> str:
    """Compact JSON for storage in TEXT columns."""
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def build_upsert(item_uuid: str, item: dict, version: str, fk_columns: list[str]) -> str:
    """Build a single UPSERT SQL statement for a loot_map item."""
    name = item.get("name", "")
    record_name = item.get("recordName", "")
    item_type = item.get("type", "")
    item_sub_type = item.get("subType", "")
    rarity = item.get("rarity", "") or None

    containers = item.get("containers", [])
    npcs = item.get("npcs", [])
    shops = item.get("shops", [])
    corpses = item.get("corpses", [])
    contracts = item.get("contracts", [])

    # Determine FK table from item type
    table = TYPE_TO_TABLE.get(item_type)
    fk_col = TABLE_TO_FK.get(table) if table else None
    category = TABLE_TO_CATEGORY.get(table, "unknown") if table else "unknown"

    # Build FK subquery (resolves UUID → id at execution time)
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

    # JSON blobs
    containers_json = json_dumps_compact(containers) if containers else "null"
    npcs_json = json_dumps_compact(npcs) if npcs else "null"
    shops_json = json_dumps_compact(shops) if shops else "null"
    corpses_json = json_dumps_compact(corpses) if corpses else "null"
    contracts_json = json_dumps_compact(contracts) if contracts else "null"

    # SQL values
    rarity_sql = f"'{escape(rarity)}'" if rarity else "NULL"
    name_sql = f"'{escape(name)}'"
    class_name_sql = f"'{escape(record_name)}'" if record_name else "NULL"
    type_sql = f"'{escape(item_type)}'" if item_type else "NULL"
    sub_type_sql = f"'{escape(item_sub_type)}'" if item_sub_type else "NULL"
    category_sql = f"'{escape(category)}'"

    # Build FK columns with NULLs for non-matching
    fk_values = []
    for col in fk_columns:
        if col == fk_col:
            fk_values.append(fk_value)
        else:
            fk_values.append("NULL")

    fk_cols_str = ", ".join(fk_columns)
    fk_vals_str = ", ".join(fk_values)

    sql = (
        f"-- {name}\n"
        f"INSERT INTO loot_map "
        f"(uuid, name, class_name, type, sub_type, rarity, category, manufacturer_name, "
        f"{fk_cols_str}, "
        f"containers_json, npcs_json, shops_json, corpses_json, contracts_json, "
        f"game_version_id, updated_at) "
        f"VALUES ("
        f"'{item_uuid}', {name_sql}, {class_name_sql}, {type_sql}, {sub_type_sql}, "
        f"{rarity_sql}, {category_sql}, {mfr_subquery}, "
        f"{fk_vals_str}, "
        f"'{escape(containers_json)}', '{escape(npcs_json)}', '{escape(shops_json)}', "
        f"'{escape(corpses_json)}', '{escape(contracts_json)}', "
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
        + ", "
        f"containers_json = excluded.containers_json, "
        f"npcs_json = excluded.npcs_json, "
        f"shops_json = excluded.shops_json, "
        f"corpses_json = excluded.corpses_json, "
        f"contracts_json = excluded.contracts_json, "
        f"updated_at = excluded.updated_at;"
    )

    return sql, fk_col is not None, rarity is not None


def main():
    parser = argparse.ArgumentParser(description="Generate loot_map D1 UPSERT SQL (batched)")
    parser.add_argument("--json", type=str, help="Path to loot_map.json")
    parser.add_argument("--version", type=str, default=DEFAULT_VERSION, help="Game version code")
    parser.add_argument("--out-dir", type=str, help="Output directory for batch files")
    parser.add_argument("--batch-size", type=int, default=100, help="Statements per batch (default: 100)")
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

    batch_num = 0
    batch_stmts: list[str] = []
    stats = {"total": 0, "with_fk": 0, "no_fk": 0, "rarity_set": 0}

    def flush_batch():
        nonlocal batch_num, batch_stmts
        if not batch_stmts:
            return
        batch_num += 1
        fname = f"batch_{batch_num:03d}.sql"
        fpath = out_dir / fname
        with open(fpath, "w") as f:
            f.write(f"-- loot_map batch {batch_num} ({len(batch_stmts)} items)\n")
            f.write(f"-- Game version: {args.version}\n\n")
            f.write("\n\n".join(batch_stmts))
            f.write("\n")
        size_mb = fpath.stat().st_size / 1024 / 1024
        print(f"  {fname}: {len(batch_stmts)} items, {size_mb:.1f} MB", file=sys.stderr)
        batch_stmts = []

    for item_uuid, item in sorted_items:
        sql, has_fk, has_rarity = build_upsert(item_uuid, item, args.version, fk_columns)
        batch_stmts.append(sql)
        stats["total"] += 1
        if has_fk:
            stats["with_fk"] += 1
        else:
            stats["no_fk"] += 1
        if has_rarity:
            stats["rarity_set"] += 1

        if len(batch_stmts) >= args.batch_size:
            flush_batch()

    # Flush remaining + add cleanup to final batch
    if batch_stmts:
        batch_stmts.append(
            "-- Filter placeholder manufacturer names\n"
            "UPDATE loot_map SET manufacturer_name = NULL\n"
            "  WHERE manufacturer_name IN ('<= PLACEHOLDER =>', '987')\n"
            "     OR manufacturer_name LIKE '@%';"
        )
        flush_batch()

    print(f"\nDone: {stats['total']} items → {batch_num} batch files in {out_dir}", file=sys.stderr)
    print(f"  With FK: {stats['with_fk']}", file=sys.stderr)
    print(f"  No FK (unknown category): {stats['no_fk']}", file=sys.stderr)
    print(f"  Rarity set: {stats['rarity_set']}", file=sys.stderr)
    print(f"\nTo load into D1:", file=sys.stderr)
    print(f"  source ~/.secrets", file=sys.stderr)
    print(f"  for f in {out_dir}/batch_*.sql; do", file=sys.stderr)
    print(f'    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"', file=sys.stderr)
    print(f"  done", file=sys.stderr)


if __name__ == "__main__":
    main()
