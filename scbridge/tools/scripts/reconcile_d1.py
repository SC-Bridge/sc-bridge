#!/usr/bin/env python3
"""
Reconcile loot_map.json against D1 — find missing, extra, and stale items.

Compares the full resolved loot_map.json against what's actually in the D1
database and generates SQL to fix any drift.

Usage:
  # Check what's missing (dry run):
  python3 reconcile_d1.py --version 4.6.0-live.11319298 --dry-run

  # Generate fix SQL:
  python3 reconcile_d1.py --version 4.6.0-live.11319298

  # Load fixes:
  source ~/.secrets
  for f in output_dir/fix_meta_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done
  for f in output_dir/fix_json_*.sql; do
    echo "Loading $f..." && npx wrangler d1 execute sc-companion --remote --file="$f"
  done

Requires: wrangler CLI configured with CLOUDFLARE_API_TOKEN
"""

import argparse
import json
import platform
import subprocess
import sys
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    DATA_ROOT = Path(r"E:\SC Bridge\Data p4k")
else:
    DATA_ROOT = Path("/mnt/e/SC Bridge/Data p4k")

# ── Reuse SQL builders from load_delta_to_d1 ──────────────────────────

# Inline the mappings to keep this script self-contained
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

FK_COLUMNS = list(TABLE_TO_FK.values())
JSON_COLUMNS = ["containers_json", "npcs_json", "shops_json", "corpses_json", "contracts_json"]
JSON_SOURCE_KEYS = ["containers", "npcs", "shops", "corpses", "contracts"]
MAX_STMT_BYTES = 800_000

# Items of these types are vehicle rewards from contracts — not real loot items
SKIP_TYPES = {"NOITEM_Vehicle"}


def escape(s: str) -> str:
    return s.replace("'", "''")


def json_compact(data) -> str:
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def build_meta_insert(item_uuid: str, item: dict, version: str) -> str:
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

    fk_values = [fk_value if col == fk_col else "NULL" for col in FK_COLUMNS]
    fk_cols_str = ", ".join(FK_COLUMNS)
    fk_vals_str = ", ".join(fk_values)

    return (
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
        + ", ".join(f"{col} = excluded.{col}" for col in FK_COLUMNS)
        + ", updated_at = excluded.updated_at;"
    )


def build_json_updates(item_uuid: str, item: dict, version: str) -> list[str]:
    version_sub = f"(SELECT id FROM game_versions WHERE code = '{version}')"
    where = f"WHERE uuid = '{item_uuid}' AND game_version_id = {version_sub}"

    blobs: list[tuple[str, str]] = []
    for col, key in zip(JSON_COLUMNS, JSON_SOURCE_KEYS):
        data = item.get(key, [])
        if data:
            blobs.append((col, escape(json_compact(data))))

    if not blobs:
        return []

    set_parts = [f"{col} = '{val}'" for col, val in blobs]
    combined = f"UPDATE loot_map SET {', '.join(set_parts)} {where};"
    if len(combined.encode()) < MAX_STMT_BYTES:
        return [combined]

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


def write_batches(stmts: list[str], out_dir: Path, prefix: str, batch_size: int) -> int:
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
            f.write(f"-- Reconciliation fix\n\n")
            f.write("\n".join(batch))
            f.write("\n")
        size_kb = fpath.stat().st_size / 1024
        print(f"  {fname}: {len(batch)} stmts, {size_kb:.0f} KB")
    return batch_num


# ── D1 query helper ──────────────────────────────────────────────────

def query_d1(sql: str) -> list[dict]:
    """Execute a SQL query against D1 and return results."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "sc-companion", "--remote",
         "--json", "--command", sql],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        # Try parsing stderr for useful error
        print(f"  D1 query failed: {result.stderr[:200]}", file=sys.stderr)
        return []
    try:
        data = json.loads(result.stdout)
        # wrangler --json wraps in array of result sets
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "results" in item:
                    return item["results"] or []
        return []
    except json.JSONDecodeError:
        print(f"  Failed to parse D1 response", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(
        description="Reconcile loot_map.json against D1 database")
    parser.add_argument("--version", type=str, required=True,
                        help="Game version code to reconcile")
    parser.add_argument("--loot-json", type=str,
                        help="Path to loot_map.json (default: auto)")
    parser.add_argument("--out-dir", type=str,
                        help="Output directory for fix SQL")
    parser.add_argument("--batch-size", type=int, default=500,
                        help="Statements per batch (default: 500)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only report — don't generate SQL")
    args = parser.parse_args()

    loot_path = (
        Path(args.loot_json) if args.loot_json
        else DATA_ROOT / args.version / "Resolved" / "loot_map.json"
    )
    if not loot_path.exists():
        print(f"ERROR: loot_map.json not found: {loot_path}")
        sys.exit(1)

    out_dir = (
        Path(args.out_dir) if args.out_dir
        else loot_path.parent / "d1_reconciliation"
    )

    print("=" * 60)
    print("D1 Loot Map Reconciliation")
    print(f"  Version: {args.version}")
    print(f"  Source:  {loot_path}")
    print("=" * 60)

    # ── Load source of truth ──────────────────────────────────────────
    print("\nLoading loot_map.json...")
    with open(loot_path) as f:
        data = json.load(f)
    source_items = data["items"]
    # Filter out vehicle reward placeholders
    source_items = {uid: item for uid, item in source_items.items()
                    if item.get("type") not in SKIP_TYPES}
    print(f"  Source items (excluding vehicles): {len(source_items)}")

    # ── Query D1 ──────────────────────────────────────────────────────
    print("\nQuerying D1 for current UUIDs...")
    d1_rows = query_d1("SELECT uuid FROM loot_map")
    if not d1_rows:
        print("ERROR: Could not query D1 (no results or connection failed)")
        sys.exit(1)
    d1_uuids = {row["uuid"] for row in d1_rows}
    print(f"  D1 items: {len(d1_uuids)}")

    # ── Compare ───────────────────────────────────────────────────────
    source_uuids = set(source_items.keys())
    missing = source_uuids - d1_uuids
    extra = d1_uuids - source_uuids  # In D1 but not in source (possibly from older version)

    print(f"\n{'=' * 60}")
    print(f"Results:")
    print(f"  In source:  {len(source_uuids)}")
    print(f"  In D1:      {len(d1_uuids)}")
    print(f"  Missing from D1: {len(missing)}")
    print(f"  In D1 but not source: {len(extra)} (may be from other versions)")

    if missing:
        print(f"\nMissing items:")
        from collections import Counter
        types = Counter()
        for uid in sorted(missing, key=lambda u: source_items[u].get("name", "")):
            item = source_items[uid]
            name = item.get("name", "?")
            itype = item.get("type", "?")
            types[itype] += 1
            sources = []
            for key in JSON_SOURCE_KEYS:
                entries = item.get(key, [])
                if entries:
                    sources.append(f"{key}:{len(entries)}")
            print(f"  {name:55s} | {itype:25s} | {', '.join(sources)}")

        print(f"\n  By type: {dict(types.most_common())}")

    if not missing:
        print(f"\nD1 is in sync — no fixes needed.")
        sys.exit(0)

    if args.dry_run:
        print(f"\n--dry-run: would generate SQL for {len(missing)} items")
        sys.exit(0)

    # ── Generate fix SQL ──────────────────────────────────────────────
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nGenerating fix SQL for {len(missing)} items...")

    meta_stmts = []
    json_stmts = []
    for uid in sorted(missing, key=lambda u: source_items[u].get("name", "")):
        item = source_items[uid]
        meta_stmts.append(build_meta_insert(uid, item, args.version))
        json_stmts.extend(build_json_updates(uid, item, args.version))

    print(f"\n=== Pass 1: Metadata INSERTs ===")
    meta_batches = write_batches(meta_stmts, out_dir, "fix_meta", args.batch_size)
    print(f"  {len(meta_stmts)} statements -> {meta_batches} batch(es)")

    print(f"\n=== Pass 2: JSON blob UPDATEs ===")
    json_batches = write_batches(json_stmts, out_dir, "fix_json", args.batch_size)
    print(f"  {len(json_stmts)} statements -> {json_batches} batch(es)")

    print(f"\n{'=' * 60}")
    print(f"To load fixes into D1:")
    print(f"  source ~/.secrets")
    print(f"  for f in {out_dir}/fix_meta_*.sql; do")
    print(f'    echo "Loading $f..." && npx wrangler d1 execute '
          f'sc-companion --remote --file="$f"')
    print(f"  done")
    print(f"  for f in {out_dir}/fix_json_*.sql; do")
    print(f'    echo "Loading $f..." && npx wrangler d1 execute '
          f'sc-companion --remote --file="$f"')
    print(f"  done")


if __name__ == "__main__":
    main()
