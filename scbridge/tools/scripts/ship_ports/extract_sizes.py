"""
Backfill vehicle_ports.size_min, size_max, and editable from ship XML files.

Uses the extracted XML files (not DataCore JSON) since port size constraints
live in the vehicle XML, not in the DataCore entities.

Flags:
  $uneditable  -> non-swappable port (locked turret, torpedo rack, door panel) -> editable=0
                  Note: we set editable=0 but never clear port_type — truly structural ports
                  already have port_type=NULL from the DataCore extraction. Clearing port_type
                  here would incorrectly hide locked-but-visible ports (e.g. Perseus torpedo racks).
  invisible uneditable -> internal component port, still show but note as non-swappable
  empty        -> normal player-swappable slot

Port size note for weapons:
  The XML size for weapon ports is the MOUNT size (e.g. S3 for an S3 gimbal/fixed mount).
  The actual weapon inside is typically 1 size smaller. We store the port's mount size
  in size_max so empty slots can display the mount class, but we use component_size
  (from vehicle_components.size via COALESCE) for display when equipped.

XML inheritance:
  Many ship variants share a parent XML (e.g. AEGS_Avenger_Titan uses AEGS_Avenger.xml).
  Use --vehicles to pass a JSON array of DB class names — the script will suffix-strip each
  class name to find the best XML match, covering all variants in one pass.
  The Modifications/ subdir is also checked: overrides with hardpoint data take priority.

Usage (classic mode — only exact XML→class matches, no variant coverage):
  python3.10 extract_sizes.py > port_sizes.sql

Usage (vehicle mode — recommended, covers all variants):
  # 1. Dump vehicle class names from D1:
  source ~/.secrets && npx wrangler d1 execute sc-companion --remote --json \\
    --command "SELECT class_name FROM vehicles WHERE class_name IS NOT NULL" \\
    | python3.10 -c "import json,sys; r=json.load(sys.stdin); print(json.dumps([row['class_name'] for row in r[0]['results']]))" \\
    > /tmp/vehicles.json
  # 2. Run:
  python3.10 extract_sizes.py --vehicles /tmp/vehicles.json > port_sizes.sql
  # 3. Apply:
  source ~/.secrets && npx wrangler d1 execute sc-companion --remote --file=port_sizes.sql
"""

import sys
import os
import json
import argparse
import xml.etree.ElementTree as ET

XML_BASE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/Extracted/XML/Data/Scripts/Entities/Vehicles/Implementations/Xml"

# Manual overrides: LOWER(class_name) -> XML basename (as on disk, without .xml).
# Used when suffix-stripping cannot automatically find the right parent XML.
MANUAL_XML_MAP: dict[str, str] = {
    # Pisces variants use manufacturer code prefix (C8/C8R/C8X), not the Pisces name
    "anvl_c8_pisces": "ANVL_Pisces",
    "anvl_c8r_pisces": "ANVL_Pisces",
    "anvl_c8x_pisces_expedition": "ANVL_Pisces",
    # Lightning F8C variants share the F8 chassis
    "anvl_lightning_f8c_collector_military": "ANVL_Lightning_F8",
    "anvl_lightning_f8c_collector_stealth": "ANVL_Lightning_F8",
    "anvl_lightning_f8c_exec": "ANVL_Lightning_F8",
    "anvl_lightning_f8c_exec_military": "ANVL_Lightning_F8",
    "anvl_lightning_f8c_plat": "ANVL_Lightning_F8",
    # Cutlass Steel (Pirate Armada edition) shares the Cutlass Black chassis
    "drak_cutlass_steel": "DRAK_Cutlass_Black",
    # DB class name uses CamelCase "AlphaWolf"; XML uses snake_case "alpha_wolf"
    "krig_l22_alphawolf": "KRIG_L22_alpha_wolf",
    # Origin 100-series: 125a and 135c share the 100i base chassis
    "orig_125a": "ORIG_100i",
    "orig_135c": "ORIG_100i",
    # Origin 300-series: 315p and 325a share the 300i base chassis
    # (350r has its own Modifications XML with full port data, handled automatically)
    "orig_315p": "ORIG_300i",
    "orig_325a": "ORIG_300i",
    # F7C Mk2 variants share the F7CM Mk2 chassis (only F7CM Mk2 has its own XML)
    "anvl_hornet_f7c_mk2": "anvl_hornet_f7cm_mk2",
    "anvl_hornet_f7cr_mk2": "anvl_hornet_f7cm_mk2",
    "anvl_hornet_f7cs_mk2": "anvl_hornet_f7cm_mk2",
    # Hermes uses the Apollo chassis XML (vehicleDefinition: rsi_apollo.xml in DataCore)
    "rsi_hermes": "rsi_apollo",
    # MDC and MTC both use the MXC chassis XML (vehicleDefinition: GRIN_MXC.xml in DataCore)
    # Note: MDC/MTC have no ports yet (extract.py only processes spaceships); map is for future use
    "grin_mdc": "GRIN_MXC",
    "grin_mtc": "GRIN_MXC",
    # Ursa Medivac variants share the Ursa Rover chassis (vehicleDefinition: rsi_ursa_rover.xml)
    # Note: no ports yet (ground vehicles not yet extracted); map is for future use
    "rsi_ursa_medivac": "RSI_Ursa_Rover",
    "rsi_ursa_medivac_stealth": "RSI_Ursa_Rover",
}


def _count_hardpoints(xml_path: str) -> int:
    """Quick check: count Part elements whose name starts with 'hardpoint_'."""
    try:
        tree = ET.parse(xml_path)
        return sum(
            1 for el in tree.iter("Part")
            if el.get("name", "").startswith("hardpoint_")
        )
    except Exception:
        return 0


def build_xml_registry(xml_base: str) -> dict[str, str]:
    """
    Build a case-insensitive registry: lower_basename -> full_path.

    Includes base XML dir + Modifications subdir. Modifications files override
    base files only when they contain hardpoint data (0-hardpoint Modification
    XMLs are omitted so suffix-stripping falls back to the base XML).
    """
    registry: dict[str, str] = {}
    xml_mods = os.path.join(xml_base, "Modifications")

    # Base XMLs first
    for f in os.listdir(xml_base):
        if f.endswith(".xml"):
            registry[f[:-4].lower()] = os.path.join(xml_base, f)

    # Modifications override base only when they define ports
    if os.path.isdir(xml_mods):
        for f in sorted(os.listdir(xml_mods)):
            if not f.endswith(".xml"):
                continue
            path = os.path.join(xml_mods, f)
            if _count_hardpoints(path) > 0:
                registry[f[:-4].lower()] = path  # override base

    return registry


def find_xml_for_class(class_name: str, registry: dict[str, str]) -> str | None:
    """
    Find the best XML path for a vehicle class name.

    Priority:
    1. MANUAL_XML_MAP (for ships with non-obvious parent relationships)
    2. Suffix-strip: try exact name, then drop last _segment and retry
       (e.g. aegs_avenger_titan -> aegs_avenger -> AEGS_Avenger.xml)
    """
    lower = class_name.lower()

    # 1. Manual override
    if lower in MANUAL_XML_MAP:
        target = MANUAL_XML_MAP[lower].lower()
        if target in registry:
            return registry[target]
        print(
            f"-- WARNING: manual map {class_name} -> {MANUAL_XML_MAP[lower]} not found in registry",
            file=sys.stderr,
        )
        return None

    # 2. Suffix stripping (exact match is the first attempt)
    parts = lower.split("_")
    for i in range(len(parts), 0, -1):
        candidate = "_".join(parts[:i])
        if candidate in registry:
            return registry[candidate]

    return None


def parse_ship_xml(xml_path: str) -> dict[str, dict]:
    """
    Walk the XML Part tree and collect ItemPort entries for all hardpoint_ Parts.
    Returns {port_name: {size_min, size_max, editable}}
    """
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception as e:
        print(f"-- ERROR parsing {xml_path}: {e}", file=sys.stderr)
        return {}

    ports: dict[str, dict] = {}

    def walk(el: ET.Element) -> None:
        for child in el:
            name = child.get("name", "")
            if child.tag == "Part" and name.startswith("hardpoint_"):
                for sub in child:
                    if sub.tag == "ItemPort":
                        flags = sub.get("flags", "")
                        # $uneditable = pure structural port (door panel, relay, etc.)
                        is_structural = "$uneditable" in flags
                        ports[name] = {
                            "size_min": int(sub.get("minSize", 0)),
                            "size_max": int(sub.get("maxSize", 0)),
                            "editable": 0 if is_structural else 1,
                        }
                walk(child)
            else:
                walk(child)

    walk(root)
    return ports


_xml_cache: dict[str, dict[str, dict]] = {}


def parse_ship_xml_cached(xml_path: str) -> dict[str, dict]:
    if xml_path not in _xml_cache:
        _xml_cache[xml_path] = parse_ship_xml(xml_path)
    return _xml_cache[xml_path]


def escape(s: str) -> str:
    return s.replace("'", "''")


def emit_updates(class_name: str, ports: dict[str, dict]) -> tuple[int, int]:
    """Print SQL UPDATE statements for one vehicle class. Returns (total, structural) counts."""
    cn = escape(class_name.lower())
    total = 0
    structural = 0
    for port_name, info in ports.items():
        size_min = info["size_min"]
        size_max = info["size_max"]
        editable = info["editable"]
        total += 1
        if editable == 0:
            structural += 1
            print(
                f"UPDATE vehicle_ports SET size_min={size_min}, size_max={size_max}, editable=0 "
                f"WHERE name='{escape(port_name)}' "
                f"AND vehicle_id=(SELECT id FROM vehicles WHERE LOWER(class_name)='{cn}');"
            )
        else:
            print(
                f"UPDATE vehicle_ports SET size_min={size_min}, size_max={size_max} "
                f"WHERE name='{escape(port_name)}' "
                f"AND vehicle_id=(SELECT id FROM vehicles WHERE LOWER(class_name)='{cn}');"
            )
    return total, structural


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill vehicle_ports sizes from ship XMLs")
    parser.add_argument(
        "--vehicles",
        metavar="FILE",
        help="JSON array of vehicle class names from DB. Enables vehicle-centric mode "
             "which resolves all variants via XML inheritance. Recommended.",
    )
    args = parser.parse_args()

    xml_dir = XML_BASE
    if not os.path.isdir(xml_dir):
        print(f"-- ERROR: XML dir not found: {xml_dir}", file=sys.stderr)
        sys.exit(1)

    registry = build_xml_registry(xml_dir)
    print(f"-- XML registry: {len(registry)} files (base + Modifications)", file=sys.stderr)

    total_ports = 0
    structural_ports = 0
    ships_processed = 0
    ships_skipped = 0

    if args.vehicles:
        # --- Vehicle-centric mode ---
        with open(args.vehicles) as f:
            vehicle_classes: list[str] = json.load(f)

        print(f"-- Vehicle mode: {len(vehicle_classes)} classes to process", file=sys.stderr)

        for class_name in sorted(vehicle_classes):
            xml_path = find_xml_for_class(class_name, registry)
            if xml_path is None:
                print(f"-- SKIPPED (no XML): {class_name}", file=sys.stderr)
                ships_skipped += 1
                continue

            ports = parse_ship_xml_cached(xml_path)
            if not ports:
                print(f"-- SKIPPED (no ports in XML): {class_name} -> {xml_path}", file=sys.stderr)
                ships_skipped += 1
                continue

            ships_processed += 1
            t, s = emit_updates(class_name, ports)
            total_ports += t
            structural_ports += s

    else:
        # --- Classic mode: one UPDATE per XML base name ---
        # Includes base dir + Modifications (only those with hardpoints, via registry).
        xml_basenames = sorted(registry.keys())
        print(
            f"-- Classic mode: {len(xml_basenames)} XML files with hardpoints",
            file=sys.stderr,
        )

        for lower_name in xml_basenames:
            xml_path = registry[lower_name]
            ports = parse_ship_xml_cached(xml_path)
            if not ports:
                continue

            # Use the original-case basename as the class name for the SQL WHERE clause.
            # LOWER() on both sides handles case mismatches in the DB.
            class_name = os.path.basename(xml_path)[:-4]
            ships_processed += 1
            t, s = emit_updates(class_name, ports)
            total_ports += t
            structural_ports += s

    print(
        f"-- Done: {ships_processed} ships processed, {ships_skipped} skipped, "
        f"{total_ports} port updates ({structural_ports} structural editable=0)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
