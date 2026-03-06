"""
Extract component class from DataCore localization descriptions and generate SQL
to populate the vehicle_components.class column.

Component descriptions contain a structured header with "Class: <value>" that
is more accurate than deriving class from manufacturer identity:
  - Per-component granularity (handles multi-class manufacturers like AEGS)
  - Directly from game data (no manual mapping needed)
  - Covers 90% of purchasable components

Usage:
  python3.10 extract.py > component_class.sql
  source ~/.secrets && npx wrangler d1 execute sc-companion --remote --file=component_class.sql

DataCore sources:
  libs/foundry/records/entities/scitem/ships/{cooler,power_plants,shield_generators,quantum_drives}/*.json
  Extracted/Data/Localization/english/global.ini
"""

import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.datacore import extract_class_from_description

DATACORE_BASE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/DataCore/libs/foundry/records"
LOCALIZATION_FILE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/Extracted/Data/Localization/english/global.ini"

COMPONENT_DIRS = [
    "entities/scitem/ships/cooler",
    "entities/scitem/ships/power_plants",
    "entities/scitem/ships/shield_generators",
    "entities/scitem/ships/quantum_drives",
]


def load_localization(ini_path: str) -> dict[str, str]:
    """Load key=value pairs from the english global.ini localization file."""
    locs: dict[str, str] = {}
    try:
        with open(ini_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith(";"):
                    key, _, val = line.partition("=")
                    locs[key.lower()] = val
    except Exception as e:
        print(f"-- WARNING: could not load localization: {e}", file=sys.stderr)
    return locs


def resolve_loc(key: str, locs: dict[str, str]) -> str | None:
    """Resolve a @loc_key localization reference to its string value."""
    if not key or not key.startswith("@"):
        return key if key else None
    return locs.get(key.lstrip("@").lower())


def escape(s: str) -> str:
    return s.replace("'", "''")


def extract_components(locs: dict[str, str]) -> list[dict]:
    """Walk component directories and extract UUID + class from description."""
    results = []

    for rel_dir in COMPONENT_DIRS:
        full_dir = os.path.join(DATACORE_BASE, rel_dir)
        if not os.path.isdir(full_dir):
            print(f"-- WARNING: dir not found: {full_dir}", file=sys.stderr)
            continue

        for fname in sorted(os.listdir(full_dir)):
            if not fname.endswith(".json") or "template" in fname.lower():
                continue

            fpath = os.path.join(full_dir, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
            except Exception as e:
                print(f"-- ERROR reading {fname}: {e}", file=sys.stderr)
                continue

            record_id = data.get("_RecordId_", "")
            if not record_id:
                continue

            val = data.get("_RecordValue_", {})
            components = val.get("Components", [])

            # Find the AttachDef for localization
            desc_key = None
            for comp in components:
                if comp.get("_Type_") == "SAttachableComponentParams":
                    attach_def = comp.get("AttachDef", {})
                    loc = attach_def.get("Localization", {})
                    if isinstance(loc, dict):
                        desc_key = loc.get("Description", "")
                    break

            if not desc_key:
                continue

            description = resolve_loc(desc_key, locs)
            cls = extract_class_from_description(description)

            if cls:
                results.append({
                    "uuid": record_id,
                    "class": cls,
                    "file": fname,
                })
                print(f"-- {fname}: {cls} (UUID={record_id})", file=sys.stderr)
            else:
                print(f"-- {fname}: no class found in description", file=sys.stderr)

    return results


def main():
    if not os.path.isdir(DATACORE_BASE):
        print(f"-- ERROR: DataCore base not found: {DATACORE_BASE}", file=sys.stderr)
        sys.exit(1)

    locs = load_localization(LOCALIZATION_FILE)
    if not locs:
        print("-- ERROR: localization file empty or not found", file=sys.stderr)
        sys.exit(1)

    components = extract_components(locs)

    if not components:
        print("-- ERROR: no components with class found", file=sys.stderr)
        sys.exit(1)

    print("-- Component class UPDATEs --")
    print("-- Sets vehicle_components.class from DataCore localization descriptions --")
    print()

    for c in components:
        print(
            f"UPDATE vehicle_components SET class = '{escape(c['class'])}' "
            f"WHERE uuid = '{c['uuid']}';"
        )

    print(f"\n-- Done: {len(components)} components with class extracted", file=sys.stderr)


if __name__ == "__main__":
    main()
