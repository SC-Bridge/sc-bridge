#!/usr/bin/env python3
"""
Version Delta — compare two resolved loot_map.json files to find changes.

Compares every item by UUID and classifies as unchanged/modified/added/removed.
Only changed items will be loaded into D1 for the new version.

Outputs:
  {new_version}/Resolved/delta_loot_map.json   — delta with changed items only
  {new_version}/Resolved/delta_report.md        — human-readable patch notes

Usage:
  python version_delta.py --old 4.6.0-live.11319298 --new 4.6.0-live.11377160
"""

import argparse
import json
import platform
import sys
import time
from collections import defaultdict
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    DATA_ROOT = Path(r"E:\SC Bridge\Data p4k")
else:
    DATA_ROOT = Path("/mnt/e/SC Bridge/Data p4k")


def loot_map_path(version: str) -> Path:
    return DATA_ROOT / version / "Resolved" / "loot_map.json"


# ── Normalization ─────────────────────────────────────────────────────

def normalize_containers(containers: list[dict]) -> str:
    """Sort containers by a stable key for comparison."""
    sorted_list = sorted(
        containers,
        key=lambda c: (
            c.get("location", ""),
            c.get("lootTable", ""),
            c.get("containerType", ""),
        ),
    )
    return json.dumps(sorted_list, sort_keys=True, separators=(",", ":"))


def normalize_npcs(npcs: list[dict]) -> str:
    sorted_list = sorted(
        npcs,
        key=lambda n: (n.get("actor", ""), n.get("slot", ""), n.get("faction", "")),
    )
    return json.dumps(sorted_list, sort_keys=True, separators=(",", ":"))


def normalize_shops(shops: list[dict]) -> str:
    sorted_list = sorted(
        shops,
        key=lambda s: (s.get("shop", s.get("name", "")),),
    )
    return json.dumps(sorted_list, sort_keys=True, separators=(",", ":"))


def normalize_corpses(corpses: list[dict]) -> str:
    sorted_list = sorted(
        corpses,
        key=lambda c: (c.get("corpseType", ""), c.get("faction", "")),
    )
    return json.dumps(sorted_list, sort_keys=True, separators=(",", ":"))


def normalize_contracts(contracts: list[dict]) -> str:
    sorted_list = sorted(
        contracts,
        key=lambda c: (c.get("guild", ""), c.get("contractKey", "")),
    )
    return json.dumps(sorted_list, sort_keys=True, separators=(",", ":"))


def item_fingerprint(item: dict) -> str:
    """Produce a canonical string fingerprint of an item for equality comparison."""
    parts = [
        item.get("name", ""),
        item.get("recordName", ""),
        item.get("type", ""),
        item.get("subType", ""),
        item.get("rarity", ""),
        normalize_containers(item.get("containers", [])),
        normalize_npcs(item.get("npcs", [])),
        normalize_shops(item.get("shops", [])),
        normalize_corpses(item.get("corpses", [])),
        normalize_contracts(item.get("contracts", [])),
    ]
    return "\x00".join(parts)


def detect_changes(old_item: dict, new_item: dict) -> list[str]:
    """Return list of field names that changed between old and new item."""
    changes = []
    for field in ("name", "recordName", "type", "subType", "rarity"):
        if old_item.get(field) != new_item.get(field):
            changes.append(field)

    normalizers = {
        "containers": normalize_containers,
        "npcs": normalize_npcs,
        "shops": normalize_shops,
        "corpses": normalize_corpses,
        "contracts": normalize_contracts,
    }
    for field, norm in normalizers.items():
        if norm(old_item.get(field, [])) != norm(new_item.get(field, [])):
            changes.append(field)

    return changes


# ── Delta ─────────────────────────────────────────────────────────────

def compute_delta(old_data: dict, new_data: dict) -> dict:
    """Compare two loot_map dicts and produce a delta."""
    old_items = old_data["items"]
    new_items = new_data["items"]
    old_uuids = set(old_items.keys())
    new_uuids = set(new_items.keys())

    added_uuids = sorted(new_uuids - old_uuids)
    removed_uuids = sorted(old_uuids - new_uuids)
    common_uuids = old_uuids & new_uuids

    # Compare common items
    modified = {}
    unchanged_count = 0
    for uuid in sorted(common_uuids):
        old_fp = item_fingerprint(old_items[uuid])
        new_fp = item_fingerprint(new_items[uuid])
        if old_fp != new_fp:
            changes = detect_changes(old_items[uuid], new_items[uuid])
            modified[uuid] = {
                "item": new_items[uuid],
                "changes": changes,
            }
        else:
            unchanged_count += 1

    added = {uuid: new_items[uuid] for uuid in added_uuids}

    return {
        "old_version": old_data["metadata"].get("version", "unknown"),
        "new_version": new_data["metadata"].get("version", "unknown"),
        "summary": {
            "total_old": len(old_items),
            "total_new": len(new_items),
            "unchanged": unchanged_count,
            "modified": len(modified),
            "added": len(added),
            "removed": len(removed_uuids),
        },
        "items": {
            "added": added,
            "modified": modified,
            "removed": removed_uuids,
        },
    }


# ── Markdown Report ──────────────────────────────────────────────────

def generate_report(delta: dict, old_items: dict, new_items: dict) -> str:
    """Generate human-readable patch notes."""
    s = delta["summary"]
    lines = [
        f"# Loot Map Delta: {delta['old_version']} -> {delta['new_version']}\n",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Items in old | {s['total_old']:,} |",
        f"| Items in new | {s['total_new']:,} |",
        f"| Unchanged | {s['unchanged']:,} |",
        f"| **Modified** | **{s['modified']:,}** |",
        f"| **Added** | **{s['added']:,}** |",
        f"| **Removed** | **{s['removed']:,}** |",
        "",
    ]

    # Added items grouped by type
    added = delta["items"]["added"]
    if added:
        lines.append(f"## New Items ({len(added)})\n")
        by_type: dict[str, list[tuple[str, dict]]] = defaultdict(list)
        for uuid, item in added.items():
            by_type[item.get("type", "Unknown")].append((uuid, item))
        for item_type in sorted(by_type.keys()):
            items = sorted(by_type[item_type], key=lambda x: x[1]["name"])
            lines.append(f"### {item_type} ({len(items)})\n")
            for uuid, item in items:
                rarity = item.get("rarity", "")
                r_str = f" [{rarity}]" if rarity else ""
                n_cont = len(item.get("containers", []))
                n_shop = len(item.get("shops", []))
                n_npc = len(item.get("npcs", []))
                sources = []
                if n_cont:
                    sources.append(f"{n_cont} containers")
                if n_shop:
                    sources.append(f"{n_shop} shops")
                if n_npc:
                    sources.append(f"{n_npc} NPCs")
                src_str = f" — {', '.join(sources)}" if sources else ""
                lines.append(f"- **{item['name']}**{r_str}{src_str}")
            lines.append("")

    # Removed items grouped by type
    removed_uuids = delta["items"]["removed"]
    if removed_uuids:
        lines.append(f"## Removed Items ({len(removed_uuids)})\n")
        by_type = defaultdict(list)
        for uuid in removed_uuids:
            item = old_items.get(uuid, {})
            by_type[item.get("type", "Unknown")].append((uuid, item))
        for item_type in sorted(by_type.keys()):
            items = sorted(by_type[item_type], key=lambda x: x[1].get("name", ""))
            lines.append(f"### {item_type} ({len(items)})\n")
            for uuid, item in items:
                lines.append(f"- ~~{item.get('name', uuid)}~~")
            lines.append("")

    # Modified items — grouped by what changed
    modified = delta["items"]["modified"]
    if modified:
        lines.append(f"## Modified Items ({len(modified)})\n")

        # Group by change type
        rarity_changes = []
        source_changes = []
        metadata_changes = []

        for uuid, entry in modified.items():
            changes = entry["changes"]
            if "rarity" in changes:
                old_rarity = old_items[uuid].get("rarity", "?")
                new_rarity = entry["item"].get("rarity", "?")
                rarity_changes.append((uuid, entry["item"], old_rarity, new_rarity))
            if any(c in changes for c in ("containers", "shops", "npcs", "corpses", "contracts")):
                source_changes.append((uuid, entry["item"], changes))
            if any(c in changes for c in ("name", "type", "subType", "recordName")) and "rarity" not in changes:
                metadata_changes.append((uuid, entry["item"], changes))

        if rarity_changes:
            lines.append(f"### Rarity Changes ({len(rarity_changes)})\n")
            for uuid, item, old_r, new_r in sorted(rarity_changes, key=lambda x: x[1]["name"]):
                lines.append(f"- **{item['name']}**: {old_r} -> {new_r}")
            lines.append("")

        if metadata_changes:
            lines.append(f"### Metadata Changes ({len(metadata_changes)})\n")
            for uuid, item, changes in sorted(metadata_changes, key=lambda x: x[1]["name"]):
                lines.append(f"- **{item['name']}**: {', '.join(changes)}")
            lines.append("")

        if source_changes:
            lines.append(f"### Source Changes ({len(source_changes)})\n")
            # Only show first 50 to keep report readable
            sorted_sc = sorted(source_changes, key=lambda x: x[1]["name"])
            for uuid, item, changes in sorted_sc[:50]:
                source_fields = [c for c in changes if c in ("containers", "shops", "npcs", "corpses", "contracts")]
                lines.append(f"- **{item['name']}**: {', '.join(source_fields)}")
            if len(sorted_sc) > 50:
                lines.append(f"- ... and {len(sorted_sc) - 50} more")
            lines.append("")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Compare two resolved loot_map.json files",
    )
    parser.add_argument("--old", type=str, required=True, help="Old version code")
    parser.add_argument("--new", type=str, required=True, help="New version code")
    args = parser.parse_args()

    old_path = loot_map_path(args.old)
    new_path = loot_map_path(args.new)

    for label, path in [("old", old_path), ("new", new_path)]:
        if not path.exists():
            print(f"ERROR: {label} loot_map.json not found: {path}")
            print(f"  Run: python build_loot_map.py --version {getattr(args, label)}")
            sys.exit(1)

    print("=" * 60)
    print("Loot Map Version Delta")
    print(f"  Old: {args.old}")
    print(f"  New: {args.new}")
    print("=" * 60)

    start = time.time()

    print("\n[1/3] Loading loot maps")
    with open(old_path) as f:
        old_data = json.load(f)
    print(f"  Old: {len(old_data['items']):,} items")
    with open(new_path) as f:
        new_data = json.load(f)
    print(f"  New: {len(new_data['items']):,} items")

    # Inject version codes into metadata for the delta output
    old_data["metadata"]["version"] = args.old
    new_data["metadata"]["version"] = args.new

    print("\n[2/3] Computing delta")
    delta = compute_delta(old_data, new_data)

    s = delta["summary"]
    print(f"  Unchanged: {s['unchanged']:,}")
    print(f"  Modified:  {s['modified']:,}")
    print(f"  Added:     {s['added']:,}")
    print(f"  Removed:   {s['removed']:,}")

    print("\n[3/3] Saving outputs")
    output_dir = DATA_ROOT / args.new / "Resolved"
    output_dir.mkdir(parents=True, exist_ok=True)

    json_out = output_dir / "delta_loot_map.json"
    with open(json_out, "w") as f:
        json.dump(delta, f, indent=2)
    print(f"  {json_out}")

    md_out = output_dir / "delta_report.md"
    report = generate_report(delta, old_data["items"], new_data["items"])
    with open(md_out, "w") as f:
        f.write(report)
    print(f"  {md_out}")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s")

    # Quick highlights
    if delta["items"]["added"]:
        print(f"\nNew items preview:")
        by_type: dict[str, int] = defaultdict(int)
        for item in delta["items"]["added"].values():
            by_type[item.get("type", "Unknown")] += 1
        for t in sorted(by_type.keys(), key=lambda x: by_type[x], reverse=True)[:10]:
            print(f"  {t}: {by_type[t]}")


if __name__ == "__main__":
    main()
