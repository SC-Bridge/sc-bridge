#!/usr/bin/env python3
"""
DataCore Diff — compare two extracted DataCore versions at the file level.

Walks both DataCore libs/foundry/records/ trees, hashes each JSON file,
and classifies every file as unchanged/modified/added/removed.

Outputs:
  {new_version}/Resolved/datacore_diff.json   — structured diff report
  {new_version}/Resolved/datacore_diff.md     — human-readable summary

First run hashes all files and caches to {version}/.file_hashes.json.
Subsequent runs for the same version load from cache (instant).

Usage:
  python datacore_diff.py --old 4.6.0-live.11319298 --new 4.6.0-live.11377160
  python datacore_diff.py --old 4.6.0-live.11319298 --new 4.6.0-live.11377160 --deep
  python datacore_diff.py --rebuild-cache 4.6.0-live.11319298

Options:
  --deep      For modified files, identify which top-level JSON keys changed
              (slower — reads both files, but only for modified files)
  --rebuild-cache VERSION
              Force rebuild the hash cache for a version, then exit
"""

import argparse
import hashlib
import json
import os
import platform
import sys
import time
from collections import defaultdict
from functools import partial
from pathlib import Path

# Unbuffered stdout for progress visibility over long runs
print = partial(print, flush=True)

# ── Paths ─────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    DATA_ROOT = Path(r"E:\SC Bridge\Data p4k")
else:
    DATA_ROOT = Path("/mnt/e/SC Bridge/Data p4k")

RECORDS_SUBPATH = Path("DataCore") / "libs" / "foundry" / "records"


def records_dir(version: str) -> Path:
    return DATA_ROOT / version / RECORDS_SUBPATH


def cache_path(version: str) -> Path:
    return DATA_ROOT / version / ".file_hashes.json"


# ── Hashing ───────────────────────────────────────────────────────────

def hash_file(path: Path) -> str:
    """SHA-256 of normalized JSON content (sorted keys, compact separators)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    except (json.JSONDecodeError, UnicodeDecodeError):
        # Fall back to raw file hash for non-JSON or broken files
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()


def _hash_worker(args: tuple[str, str]) -> tuple[str, str]:
    """Worker for parallel hashing. Args: (base_dir, relative_path)."""
    base, rel = args
    return rel, hash_file(Path(base) / rel)


def build_hash_index(version: str, force: bool = False, workers: int = 8) -> dict[str, str]:
    """Build or load a cached {relative_path: sha256} index for a version.

    Relative paths use forward slashes from the records/ root.
    Uses multiprocessing to speed up hashing over slow filesystems (WSL drvfs).
    """
    cp = cache_path(version)
    if cp.exists() and not force:
        print(f"  Loading cached hashes for {version}...")
        with open(cp, "r") as f:
            return json.load(f)

    base = records_dir(version)
    if not base.exists():
        print(f"  ERROR: {base} does not exist")
        sys.exit(1)

    print(f"  Scanning files in {version}...")
    json_files = sorted(base.rglob("*.json"))
    total = len(json_files)
    rel_paths = [(str(base), p.relative_to(base).as_posix()) for p in json_files]
    print(f"  Found {total:,} JSON files, hashing with {workers} workers...")

    start = time.time()

    # Use multiprocessing for parallel hashing
    from multiprocessing import Pool

    index: dict[str, str] = {}
    with Pool(workers) as pool:
        for i, (rel, h) in enumerate(pool.imap_unordered(_hash_worker, rel_paths, chunksize=200), 1):
            index[rel] = h
            if i % 5000 == 0 or i == total:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                print(f"    {i}/{total} ({rate:.0f} files/s)")

    # Cache for next time
    cp.parent.mkdir(parents=True, exist_ok=True)
    with open(cp, "w") as f:
        json.dump(index, f)
    print(f"  Cached {len(index)} hashes to {cp}")

    return index


# ── Diffing ───────────────────────────────────────────────────────────

def categorize(path: str) -> str:
    """Extract the category from a relative path (first 2-3 path segments)."""
    parts = path.split("/")
    # Most paths: entities/scitem/ships/cooler/foo.json -> entities/scitem/ships
    # Short paths: actor/foo.json -> actor
    if len(parts) >= 3 and parts[0] == "entities":
        return "/".join(parts[:3])
    elif len(parts) >= 2:
        return "/".join(parts[:2])
    else:
        return parts[0] if parts else "unknown"


def diff_keys(old_version: str, new_version: str, rel_path: str) -> list[str]:
    """For a modified file, return which top-level JSON keys changed."""
    old_path = records_dir(old_version) / rel_path
    new_path = records_dir(new_version) / rel_path
    try:
        with open(old_path) as f:
            old_data = json.load(f)
        with open(new_path) as f:
            new_data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return ["<parse error>"]

    changed = []
    all_keys = set(old_data.keys()) | set(new_data.keys())
    for key in sorted(all_keys):
        old_val = json.dumps(old_data.get(key), sort_keys=True, separators=(",", ":"))
        new_val = json.dumps(new_data.get(key), sort_keys=True, separators=(",", ":"))
        if old_val != new_val:
            changed.append(key)
    return changed


def compute_diff(
    old_index: dict[str, str],
    new_index: dict[str, str],
    old_version: str,
    new_version: str,
    deep: bool = False,
) -> dict:
    """Compare two hash indexes and produce a structured diff."""
    old_keys = set(old_index.keys())
    new_keys = set(new_index.keys())

    added_paths = sorted(new_keys - old_keys)
    removed_paths = sorted(old_keys - new_keys)
    common_paths = old_keys & new_keys

    modified_paths = sorted(
        p for p in common_paths if old_index[p] != new_index[p]
    )
    unchanged_count = len(common_paths) - len(modified_paths)

    # Build category summaries
    by_category: dict[str, dict[str, int]] = defaultdict(
        lambda: {"modified": 0, "added": 0, "removed": 0}
    )
    for p in modified_paths:
        by_category[categorize(p)]["modified"] += 1
    for p in added_paths:
        by_category[categorize(p)]["added"] += 1
    for p in removed_paths:
        by_category[categorize(p)]["removed"] += 1

    # Sort categories by total changes descending
    sorted_categories = dict(
        sorted(
            by_category.items(),
            key=lambda x: sum(x[1].values()),
            reverse=True,
        )
    )

    # Build file lists
    modified_files = []
    for p in modified_paths:
        entry: dict = {"path": p, "category": categorize(p)}
        if deep:
            entry["diff_keys"] = diff_keys(old_version, new_version, p)
        modified_files.append(entry)

    added_files = [{"path": p, "category": categorize(p)} for p in added_paths]
    removed_files = [{"path": p, "category": categorize(p)} for p in removed_paths]

    return {
        "old_version": old_version,
        "new_version": new_version,
        "summary": {
            "total_old": len(old_index),
            "total_new": len(new_index),
            "unchanged": unchanged_count,
            "modified": len(modified_paths),
            "added": len(added_paths),
            "removed": len(removed_paths),
        },
        "by_category": sorted_categories,
        "files": {
            "modified": modified_files,
            "added": added_files,
            "removed": removed_files,
        },
    }


# ── Output ────────────────────────────────────────────────────────────

def generate_markdown(diff_data: dict) -> str:
    """Generate human-readable markdown summary."""
    s = diff_data["summary"]
    lines = [
        f"# DataCore Diff: {diff_data['old_version']} -> {diff_data['new_version']}\n",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Files in old | {s['total_old']:,} |",
        f"| Files in new | {s['total_new']:,} |",
        f"| Unchanged | {s['unchanged']:,} |",
        f"| **Modified** | **{s['modified']:,}** |",
        f"| **Added** | **{s['added']:,}** |",
        f"| **Removed** | **{s['removed']:,}** |",
        "",
    ]

    # Category breakdown
    lines.append("## Changes by Category\n")
    lines.append("| Category | Modified | Added | Removed | Total |")
    lines.append("|----------|----------|-------|---------|-------|")
    for cat, counts in diff_data["by_category"].items():
        total = sum(counts.values())
        lines.append(
            f"| `{cat}` | {counts['modified']} | {counts['added']} | {counts['removed']} | {total} |"
        )
    lines.append("")

    # Added files
    if diff_data["files"]["added"]:
        lines.append(f"## Added Files ({len(diff_data['files']['added'])})\n")
        by_cat: dict[str, list[str]] = defaultdict(list)
        for f in diff_data["files"]["added"]:
            by_cat[f["category"]].append(f["path"])
        for cat in sorted(by_cat.keys()):
            lines.append(f"### `{cat}`\n")
            for p in by_cat[cat]:
                lines.append(f"- `{p}`")
            lines.append("")

    # Removed files
    if diff_data["files"]["removed"]:
        lines.append(f"## Removed Files ({len(diff_data['files']['removed'])})\n")
        by_cat = defaultdict(list)
        for f in diff_data["files"]["removed"]:
            by_cat[f["category"]].append(f["path"])
        for cat in sorted(by_cat.keys()):
            lines.append(f"### `{cat}`\n")
            for p in by_cat[cat]:
                lines.append(f"- `{p}`")
            lines.append("")

    # Modified files (with key changes if --deep was used)
    if diff_data["files"]["modified"]:
        lines.append(f"## Modified Files ({len(diff_data['files']['modified'])})\n")
        by_cat = defaultdict(list)
        for f in diff_data["files"]["modified"]:
            by_cat[f["category"]].append(f)
        for cat in sorted(by_cat.keys()):
            lines.append(f"### `{cat}` ({len(by_cat[cat])} files)\n")
            for f in by_cat[cat]:
                if "diff_keys" in f:
                    keys_str = ", ".join(f["diff_keys"])
                    lines.append(f"- `{f['path']}` — changed: {keys_str}")
                else:
                    lines.append(f"- `{f['path']}`")
            lines.append("")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Compare two extracted DataCore versions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--old", type=str, help="Old version code (e.g. 4.6.0-live.11319298)")
    parser.add_argument("--new", type=str, help="New version code (e.g. 4.6.0-live.11377160)")
    parser.add_argument(
        "--deep", action="store_true",
        help="For modified files, identify which JSON keys changed (slower)",
    )
    parser.add_argument(
        "--rebuild-cache", type=str, metavar="VERSION",
        help="Force rebuild hash cache for VERSION, then exit",
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="Number of parallel hash workers (default: 8)",
    )
    args = parser.parse_args()

    if args.rebuild_cache:
        build_hash_index(args.rebuild_cache, force=True, workers=args.workers)
        return

    if not args.old or not args.new:
        parser.error("--old and --new are required (unless using --rebuild-cache)")

    print("=" * 60)
    print("DataCore Diff")
    print(f"  Old: {args.old}")
    print(f"  New: {args.new}")
    print(f"  Deep: {args.deep}")
    print("=" * 60)

    overall_start = time.time()

    # Build/load hash indexes
    print(f"\n[1/3] Building hash indexes")
    old_index = build_hash_index(args.old, workers=args.workers)
    new_index = build_hash_index(args.new, workers=args.workers)

    # Compute diff
    print(f"\n[2/3] Computing diff")
    diff_data = compute_diff(old_index, new_index, args.old, args.new, deep=args.deep)

    s = diff_data["summary"]
    print(f"  Unchanged: {s['unchanged']:,}")
    print(f"  Modified:  {s['modified']:,}")
    print(f"  Added:     {s['added']:,}")
    print(f"  Removed:   {s['removed']:,}")

    # Save outputs
    print(f"\n[3/3] Saving outputs")
    output_dir = DATA_ROOT / args.new / "Resolved"
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "datacore_diff.json"
    with open(json_path, "w") as f:
        json.dump(diff_data, f, indent=2)
    print(f"  {json_path}")

    md_path = output_dir / "datacore_diff.md"
    md_content = generate_markdown(diff_data)
    with open(md_path, "w") as f:
        f.write(md_content)
    print(f"  {md_path}")

    elapsed = time.time() - overall_start
    print(f"\nDone in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
