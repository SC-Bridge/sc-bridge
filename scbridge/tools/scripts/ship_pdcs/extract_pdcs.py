"""
Extract PDC (Point Defence Controller) turret components from DataCore and generate SQL to:
  1. UPSERT into vehicle_components (PDC turret housings - TurretBase, SubType=PDCTurret)
  2. UPDATE vehicle_ports to set port_type='pdc', category_label='PDCs' for all ports
     equipped with a PDC turret UUID.

PDC structure in-game:
  hardpoint_pdc_* (ship port) → PDC TurretBase housing (size 2, this script)
                               └─ internal weapon port → M2C "Swarm" WeaponGun (size 1, in ship_weapons/)

PDC housings are NOT in vehicle_components by default because the ship_ports extraction
only follows one level deep. This script covers them.

Usage:
  python3.10 extract_pdcs.py > pdc_components.sql
  source ~/.secrets && npx wrangler d1 execute sc-companion --remote --file=pdc_components.sql

DataCore source:
  libs/foundry/records/entities/scitem/ships/turret/turret_pdc_*.json
  (excludes turret_pdc_scitem_template.json)
"""

import sys
import os
import json

DATACORE_BASE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/DataCore/libs/foundry/records"
PDC_TURRET_DIR = os.path.join(DATACORE_BASE, "entities/scitem/ships/turret")
LOCALIZATION_FILE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/Extracted/Data/Localization/english/global.ini"

# Behring manufacturer id in the vehicles DB
BEHR_MANUFACTURER_ID = 390


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


def resolve_name(name_key: str, locs: dict[str, str]) -> str:
    """Resolve a @item_Name... localization key to its display string."""
    if not name_key or not name_key.startswith("@"):
        return name_key
    key = name_key.lstrip("@").lower()
    return locs.get(key, name_key)


def escape(s: str) -> str:
    return s.replace("'", "''")


def slug_from_name(name: str) -> str:
    """Generate a simple slug from a display name."""
    import re
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def extract_pdc_components(pdc_dir: str, locs: dict[str, str]) -> list[dict]:
    """
    Walk pdc_dir and extract metadata for each turret_pdc_*.json component.
    Returns list of dicts with keys: uuid, name, slug, class_name, type, sub_type, size, grade.
    """
    components = []
    for fname in sorted(os.listdir(pdc_dir)):
        if not fname.startswith("turret_pdc_") or fname == "turret_pdc_scitem_template.json":
            continue
        fpath = os.path.join(pdc_dir, fname)
        try:
            with open(fpath) as f:
                data = json.load(f)
        except Exception as e:
            print(f"-- ERROR reading {fname}: {e}", file=sys.stderr)
            continue

        record_id = data.get("_RecordId_", "")
        record_name = data.get("_RecordName_", "")
        # Strip "EntityClassDefinition." prefix for class_name
        class_name = record_name.replace("EntityClassDefinition.", "")

        val = data.get("_RecordValue_", {})
        component_list = val.get("Components", [])

        attach_def = None
        for comp in component_list:
            if comp.get("_Type_") == "SAttachableComponentParams":
                attach_def = comp.get("AttachDef", {})
                break

        if not attach_def:
            print(f"-- WARNING: no AttachDef in {fname}", file=sys.stderr)
            continue

        size = attach_def.get("Size", 0)
        grade = attach_def.get("Grade", 0)
        item_type = attach_def.get("Type", "Turret")
        sub_type = attach_def.get("SubType", "PDCTurret")
        loc = attach_def.get("Localization", {})
        name_key = loc.get("Name", "") if isinstance(loc, dict) else ""
        display_name = resolve_name(name_key, locs)

        components.append(
            {
                "uuid": record_id,
                "name": display_name,
                "slug": slug_from_name(display_name),
                "class_name": class_name,
                "type": item_type,
                "sub_type": sub_type,
                "size": size,
                "grade": grade,
            }
        )
        print(
            f"-- {fname}: {display_name!r} (UUID={record_id}, size={size}, subtype={sub_type})",
            file=sys.stderr,
        )

    return components


def main():
    if not os.path.isdir(PDC_TURRET_DIR):
        print(f"-- ERROR: PDC turret dir not found: {PDC_TURRET_DIR}", file=sys.stderr)
        sys.exit(1)

    locs = load_localization(LOCALIZATION_FILE)
    components = extract_pdc_components(PDC_TURRET_DIR, locs)

    if not components:
        print("-- ERROR: no PDC components found", file=sys.stderr)
        sys.exit(1)

    print("-- PDC component UPSERTs --")
    uuids = []
    for c in components:
        uuids.append(c["uuid"])
        name = escape(c["name"])
        slug = escape(c["slug"])
        class_name = escape(c["class_name"])
        comp_type = escape(c["type"])
        sub_type = escape(c["sub_type"])
        size = c["size"]
        grade = c["grade"]
        print(
            f"INSERT INTO vehicle_components (uuid, name, slug, class_name, manufacturer_id, type, sub_type, size, grade) "
            f"VALUES ('{c['uuid']}', '{name}', '{slug}', '{class_name}', {BEHR_MANUFACTURER_ID}, "
            f"'{comp_type}', '{sub_type}', {size}, {grade}) "
            f"ON CONFLICT(uuid) DO UPDATE SET "
            f"name=excluded.name, slug=excluded.slug, class_name=excluded.class_name, "
            f"manufacturer_id=excluded.manufacturer_id, type=excluded.type, sub_type=excluded.sub_type, "
            f"size=excluded.size, grade=excluded.grade, updated_at=datetime('now');"
        )

    print()
    print("-- Update vehicle_ports: set port_type='pdc', category_label='PDCs' for all PDC ports --")
    uuid_list = ", ".join(f"'{u}'" for u in uuids)
    print(
        f"UPDATE vehicle_ports SET port_type='pdc', category_label='PDCs' "
        f"WHERE equipped_item_uuid IN ({uuid_list});"
    )

    print(f"\n-- Done: {len(components)} PDC components", file=sys.stderr)


if __name__ == "__main__":
    main()
