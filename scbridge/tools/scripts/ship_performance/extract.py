#!/usr/bin/env python3.10
"""
Ship Performance Data Extraction
=================================
Extracts flight performance stats from DataCore and populates the D1 database.

Extracted fields:
  - boost_speed_back        (controller_flight_{class}.json → IFCSParams.boostSpeedBackward)
  - angular_velocity_pitch  (IFCSParams.maxAngularVelocity.x)
  - angular_velocity_yaw    (IFCSParams.maxAngularVelocity.y)
  - angular_velocity_roll   (IFCSParams.maxAngularVelocity.z)
  - fuel_capacity_hydrogen  (fueltanks/htnk_{class}.json → ResourceContainer.capacity.standardCargoUnits)
  - fuel_capacity_quantum   (fueltanks/qtnk_{class}.json → ResourceContainer.capacity.standardCargoUnits)
  - thruster_count_main     (spaceships/{class}.json → loadout entries with MainThruster type)
  - thruster_count_maneuvering (loadout entries with ManneuverThruster type)

Usage:
  python3.10 extract.py [--dry-run] [--slug SLUG]

  --dry-run   Print SQL without executing
  --slug SLUG Only process the given ship slug (for testing)

Requirements:
  - python3.10 (scdatatools ZIP64 fix only applied here)
  - CLOUDFLARE_API_TOKEN in environment (source ~/.secrets first)
  - wrangler installed globally

NOTE: Use python3.10, NOT python3.14 — ZIP64 fix is only patched on 3.10.
"""

import json
import os
import sys
import subprocess
import argparse
from pathlib import Path

DATACORE_BASE = Path("/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/DataCore/libs/foundry/records/entities/scitem/ships")
SPACESHIPS_BASE = Path("/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722/DataCore/libs/foundry/records/entities/spaceships")
D1_DATABASE = "sc-companion"


def run_wrangler(command: str) -> list[dict]:
    """Run a wrangler D1 query and return the results as a list of dicts."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", D1_DATABASE, "--remote", "--json", "--command", command],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERROR: wrangler failed: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(result.stdout)
    return data[0]["results"] if data else []


def apply_sql(sql: str, dry_run: bool) -> None:
    """Execute a SQL statement against D1, or print it in dry-run mode."""
    if dry_run:
        print(sql)
        return
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", D1_DATABASE, "--remote", "--command", sql],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERROR applying SQL: {result.stderr}", file=sys.stderr)
        print(f"SQL was: {sql}", file=sys.stderr)


def get_vehicles(slug_filter: str | None = None) -> list[dict]:
    """Fetch all non-paint vehicles with their slugs and class_names."""
    where = "WHERE v.is_paint_variant = 0"
    if slug_filter:
        where += f" AND v.slug = '{slug_filter}'"
    rows = run_wrangler(
        f"SELECT v.id, v.slug, v.class_name FROM vehicles v {where} ORDER BY v.name"
    )
    return rows


def load_json(path: Path) -> dict | None:
    """Load a JSON file, returning None if not found."""
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_ifcs_params(class_name: str) -> dict | None:
    """Extract IFCSParams from the flight controller DataCore file."""
    fname = class_name.lower() + ".json"
    path = DATACORE_BASE / "controller" / f"controller_flight_{fname}"
    data = load_json(path)
    if not data:
        return None
    for comp in data["_RecordValue_"]["Components"]:
        if comp.get("_Type_") == "IFCSParams":
            return comp
    return None


def get_fuel_capacity(class_name: str, fuel_type: str) -> float | None:
    """
    Extract fuel capacity from a fuel tank DataCore file.
    fuel_type: 'htnk' (hydrogen) or 'qtnk' (quantum)
    """
    fname = class_name.lower() + ".json"
    path = DATACORE_BASE / "fueltanks" / f"{fuel_type}_{fname}"
    data = load_json(path)
    if not data:
        return None
    for comp in data["_RecordValue_"]["Components"]:
        if comp.get("_Type_") == "ResourceContainer":
            capacity = comp.get("capacity", {})
            if isinstance(capacity, dict):
                scu = capacity.get("standardCargoUnits")
                if scu is not None:
                    return float(scu)
    return None


def get_thruster_type(entity_class: str) -> str | None:
    """
    Look up a thruster entity's type (Main or ManneuverThruster) from DataCore.
    Returns 'Main', 'ManneuverThruster', or None if not found.
    """
    fname = entity_class.lower() + ".json"
    path = DATACORE_BASE / "thrusters" / fname
    data = load_json(path)
    if not data:
        return None
    for comp in data["_RecordValue_"]["Components"]:
        if comp.get("_Type_") == "SAttachableComponentParams":
            attach_type = comp.get("AttachDef", {}).get("Type", "")
            if attach_type in ("MainThruster", "ManneuverThruster"):
                return attach_type
    return None


def get_thruster_counts(class_name: str) -> tuple[int | None, int | None]:
    """
    Count main and maneuvering thrusters from the spaceship DataCore file.
    Returns (main_count, maneuvering_count).
    """
    fname = class_name.lower() + ".json"
    path = SPACESHIPS_BASE / fname
    data = load_json(path)
    if not data:
        return None, None

    # Walk loadout entries to find all thruster port items
    def collect_thruster_entries(obj: object, results: list) -> None:
        if isinstance(obj, dict):
            port_name = obj.get("itemPortName", "")
            entity = obj.get("entityClassName", "")
            if "thruster" in port_name.lower() and entity:
                results.append(entity)
            for v in obj.values():
                collect_thruster_entries(v, results)
        elif isinstance(obj, list):
            for v in obj:
                collect_thruster_entries(v, results)

    thruster_entities: list[str] = []
    collect_thruster_entries(data, thruster_entities)

    if not thruster_entities:
        return None, None

    # Resolve unique entities to avoid redundant file reads
    entity_type_cache: dict[str, str | None] = {}
    main_count = 0
    maneuvering_count = 0

    for entity in thruster_entities:
        if entity not in entity_type_cache:
            entity_type_cache[entity] = get_thruster_type(entity)
        thruster_type = entity_type_cache[entity]
        if thruster_type == "MainThruster":
            main_count += 1
        elif thruster_type == "ManneuverThruster":
            maneuvering_count += 1

    return (
        main_count if main_count > 0 else None,
        maneuvering_count if maneuvering_count > 0 else None,
    )


def process_vehicle(vehicle: dict) -> dict | None:
    """
    Extract all performance data for a single vehicle.
    Returns a dict of column → value (None values are skipped), or None if no data found.
    """
    class_name = vehicle["class_name"]
    if not class_name:
        return None

    updates: dict[str, object] = {}

    # Flight controller data
    ifcs = get_ifcs_params(class_name)
    if ifcs:
        if ifcs.get("boostSpeedBackward") is not None:
            updates["boost_speed_back"] = int(ifcs["boostSpeedBackward"])
        ang_vel = ifcs.get("maxAngularVelocity", {})
        if isinstance(ang_vel, dict):
            if ang_vel.get("x") is not None:
                updates["angular_velocity_pitch"] = float(ang_vel["x"])
            if ang_vel.get("y") is not None:
                updates["angular_velocity_yaw"] = float(ang_vel["y"])
            if ang_vel.get("z") is not None:
                updates["angular_velocity_roll"] = float(ang_vel["z"])

    # Fuel tanks
    h2 = get_fuel_capacity(class_name, "htnk")
    if h2 is not None:
        updates["fuel_capacity_hydrogen"] = h2

    qt = get_fuel_capacity(class_name, "qtnk")
    if qt is not None:
        updates["fuel_capacity_quantum"] = qt

    # Thruster counts
    main_count, mav_count = get_thruster_counts(class_name)
    if main_count is not None:
        updates["thruster_count_main"] = main_count
    if mav_count is not None:
        updates["thruster_count_maneuvering"] = mav_count

    return updates if updates else None


def build_update_sql(vehicle_id: int, updates: dict) -> str:
    """Build a SQL UPDATE statement for the given vehicle."""
    set_clauses = []
    for col, val in updates.items():
        if isinstance(val, str):
            set_clauses.append(f"{col} = '{val}'")
        elif val is None:
            set_clauses.append(f"{col} = NULL")
        else:
            set_clauses.append(f"{col} = {val}")
    return f"UPDATE vehicles SET {', '.join(set_clauses)} WHERE id = {vehicle_id}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract ship performance data from DataCore into D1")
    parser.add_argument("--dry-run", action="store_true", help="Print SQL without executing")
    parser.add_argument("--slug", help="Only process a specific ship slug")
    args = parser.parse_args()

    print(f"Fetching vehicles from D1...", file=sys.stderr)
    vehicles = get_vehicles(args.slug)
    print(f"Processing {len(vehicles)} vehicles...", file=sys.stderr)

    found = 0
    skipped = 0

    for vehicle in vehicles:
        slug = vehicle["slug"]
        vehicle_id = vehicle["id"]

        updates = process_vehicle(vehicle)
        if not updates:
            skipped += 1
            continue

        sql = build_update_sql(vehicle_id, updates)
        apply_sql(sql, args.dry_run)

        found += 1
        fields = ", ".join(updates.keys())
        print(f"  [{slug}] updated: {fields}", file=sys.stderr)

    print(f"\nDone: {found} updated, {skipped} skipped (no DataCore files found)", file=sys.stderr)


if __name__ == "__main__":
    main()
