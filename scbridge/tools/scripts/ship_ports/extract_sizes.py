"""
Backfill vehicle_ports.size_min, size_max, and editable from ship XML files.

Uses the extracted XML files (not DataCore JSON) since port size constraints
live in the vehicle XML, not in the DataCore entities.

Usage:
  python3.10 extract_sizes.py > port_sizes.sql
  source ~/.secrets && npx wrangler d1 execute sc-companion --remote --file=port_sizes.sql

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
"""

import sys
import os
import xml.etree.ElementTree as ET

XML_BASE = "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/Extracted/XML/Data/Scripts/Entities/Vehicles/Implementations/Xml"


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

    def walk(el):
        for child in el:
            name = child.get("name", "")
            if child.tag == "Part" and name.startswith("hardpoint_"):
                for sub in child:
                    if sub.tag == "ItemPort":
                        flags = sub.get("flags", "")
                        # $uneditable = pure structural port (door panel, relay, etc.)
                        # These should be hidden from the loadout UI.
                        is_structural = "$uneditable" in flags
                        ports[name] = {
                            "size_min": int(sub.get("minSize", 0)),
                            "size_max": int(sub.get("maxSize", 0)),
                            "editable": 0 if is_structural else 1,
                        }
                # Recurse regardless so nested parts are found
                walk(child)
            else:
                walk(child)

    walk(root)
    return ports


def escape(s: str) -> str:
    return s.replace("'", "''")


def main():
    xml_dir = XML_BASE
    if not os.path.isdir(xml_dir):
        print(f"-- ERROR: XML dir not found: {xml_dir}", file=sys.stderr)
        sys.exit(1)

    xml_files = [f for f in os.listdir(xml_dir) if f.endswith(".xml")]
    print(f"-- Found {len(xml_files)} XML files", file=sys.stderr)

    total_ports = 0
    structural_ports = 0
    ships_processed = 0

    for xml_file in sorted(xml_files):
        class_name = xml_file[:-4]  # strip .xml
        xml_path = os.path.join(xml_dir, xml_file)
        ports = parse_ship_xml(xml_path)

        if not ports:
            continue

        ships_processed += 1
        for port_name, info in ports.items():
            size_min = info["size_min"]
            size_max = info["size_max"]
            editable = info["editable"]
            total_ports += 1
            if editable == 0:
                structural_ports += 1

            # Use LOWER() on both sides — some XML files use rsi_perseus.xml (lowercase)
            # while the DB stores class_name as RSI_Perseus (mixed case).
            cn = escape(class_name.lower())
            if editable == 0:
                # Non-swappable port: set editable=0 but do NOT clear port_type/category_label.
                # Truly structural ports already have port_type=NULL from DataCore extraction.
                # Clearing here would incorrectly hide locked-but-visible ports like Perseus
                # torpedo racks and turrets which the XML marks $uneditable.
                print(
                    f"UPDATE vehicle_ports SET size_min={size_min}, size_max={size_max}, editable=0 "
                    f"WHERE name='{escape(port_name)}' "
                    f"AND vehicle_id=(SELECT id FROM vehicles WHERE LOWER(class_name)='{cn}');"
                )
            else:
                # Normal player-swappable port: just update sizes
                print(
                    f"UPDATE vehicle_ports SET size_min={size_min}, size_max={size_max} "
                    f"WHERE name='{escape(port_name)}' "
                    f"AND vehicle_id=(SELECT id FROM vehicles WHERE LOWER(class_name)='{cn}');"
                )

    print(
        f"-- Done: {ships_processed} ships, {total_ports} ports "
        f"({structural_ports} structural hidden)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
