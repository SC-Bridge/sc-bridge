"""
Fetch all Erkul API endpoints and save as JSON reference snapshots.

This script is a READ-ONLY reference tool. The data is NOT used in the SC Bridge
app — our source of truth is DataCore (game files). Use this to:
  - Cross-reference loadout data against our DataCore extraction
  - Spot-check port sizes, editable flags, equipped items
  - Validate after a game patch before re-running extraction scripts

Usage:
  python3.10 fetch_erkul.py                          # saves to ./snapshots/YYYY-MM-DD/
  python3.10 fetch_erkul.py --out /tmp/erkul          # custom output dir
  python3.10 fetch_erkul.py --env ptu                 # pull PTU endpoints instead

API:
  server.erkul.games/live/{endpoint}   — live game data
  server.erkul.games/ptu/{endpoint}    — PTU game data
  server.erkul.games/informations      — version metadata
  server.erkul.games/live-differences  — delta between PTU and live

Erkul requires Origin: https://www.erkul.games to be set, otherwise returns 418.
This script sets that header but does NOT scrape or mirror Erkul's site — it only
fetches the same JSON endpoints the Erkul SPA loads for its own rendering.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

try:
    import urllib.request as urlreq
    import urllib.error as urlerr
except ImportError:
    print("ERROR: urllib not available", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://server.erkul.games"
HEADERS = {
    "Origin": "https://www.erkul.games",
    "Referer": "https://www.erkul.games/",
    "User-Agent": "Mozilla/5.0 (compatible; SC-Bridge-Reference/1.0)",
    "Accept": "application/json",
}

# Endpoints available under /live/ and /ptu/
VERSIONED_ENDPOINTS = [
    "ships",
    "weapons",
    "turrets",
    "shields",
    "power-plants",
    "coolers",
    "qdrives",
    "missiles",
    "missile-racks",
    "mounts",
    "modules",
    "utilities",
    "bombs",
    "emps",
    "qeds",
    "jumpdrives",
    "mining-lasers",
    "controllers",
    "paints",
]

# Top-level endpoints (not versioned)
GLOBAL_ENDPOINTS = [
    "informations",
    "live-differences",
    "shop",
]


def fetch(url: str, retries: int = 3, timeout: int = 30) -> dict | list:
    """Fetch a JSON URL with retry logic."""
    req = urlreq.Request(url, headers=HEADERS)
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with urlreq.urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    raise ValueError(f"HTTP {resp.status}")
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urlerr.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.reason}"
        except urlerr.URLError as e:
            last_err = f"URLError: {e.reason}"
        except Exception as e:
            last_err = str(e)
        if attempt < retries:
            wait = 2 ** attempt
            print(f"  retry {attempt}/{retries - 1} in {wait}s ({last_err})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Failed after {retries} attempts: {last_err}")


def save(path: str, data: dict | list) -> int:
    """Write JSON to path, return byte count."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return os.path.getsize(path)


def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def main():
    parser = argparse.ArgumentParser(description="Fetch Erkul API reference snapshots")
    parser.add_argument("--out", default=None, help="Output directory (default: ./snapshots/YYYY-MM-DD)")
    parser.add_argument("--env", choices=["live", "ptu"], default="live", help="Game environment (default: live)")
    parser.add_argument("--no-global", action="store_true", help="Skip global endpoints (informations, shop, etc.)")
    args = parser.parse_args()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = args.out or os.path.join(os.path.dirname(__file__), "snapshots", ts)
    os.makedirs(out_dir, exist_ok=True)

    manifest = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "env": args.env,
        "base_url": BASE_URL,
        "files": {},
        "errors": {},
    }

    total_bytes = 0
    success = 0
    failed = 0

    # --- versioned endpoints ---
    print(f"Fetching {args.env} endpoints → {out_dir}", file=sys.stderr)
    for ep in VERSIONED_ENDPOINTS:
        url = f"{BASE_URL}/{args.env}/{ep}"
        fname = f"{args.env}_{ep.replace('-', '_')}.json"
        fpath = os.path.join(out_dir, fname)
        print(f"  {url} ...", end=" ", file=sys.stderr)
        try:
            data = fetch(url)
            size = save(fpath, data)
            total_bytes += size
            count = len(data) if isinstance(data, list) else "object"
            manifest["files"][fname] = {"url": url, "size": size, "count": count}
            print(f"{count} items, {human_bytes(size)}", file=sys.stderr)
            success += 1
        except Exception as e:
            manifest["errors"][fname] = str(e)
            print(f"ERROR: {e}", file=sys.stderr)
            failed += 1

    # --- global endpoints ---
    if not args.no_global:
        for ep in GLOBAL_ENDPOINTS:
            url = f"{BASE_URL}/{ep}"
            fname = f"{ep.replace('-', '_')}.json"
            fpath = os.path.join(out_dir, fname)
            print(f"  {url} ...", end=" ", file=sys.stderr)
            try:
                data = fetch(url)
                size = save(fpath, data)
                total_bytes += size
                count = len(data) if isinstance(data, list) else "object"
                manifest["files"][fname] = {"url": url, "size": size, "count": count}
                print(f"{count} items, {human_bytes(size)}", file=sys.stderr)
                success += 1
            except Exception as e:
                manifest["errors"][fname] = str(e)
                print(f"ERROR: {e}", file=sys.stderr)
                failed += 1

    # Extract version info from informations if available.
    # The endpoint returns [{liveVersion, ptuVersion, ...}, {sessionToken: ...}].
    # Strip the session token before saving — it's short-lived auth and not reference data.
    info_path = os.path.join(out_dir, "informations.json")
    if os.path.exists(info_path):
        try:
            with open(info_path) as f:
                info = json.load(f)
            # Find the metadata object (not the session token object)
            meta = next((x for x in info if isinstance(x, dict) and "liveVersion" in x), None)
            if meta:
                manifest["sc_version_live"] = meta.get("liveVersion")
                manifest["sc_version_ptu"] = meta.get("ptuVersion")
                manifest["live_entities"] = meta.get("liveEntities")
                # Rewrite informations.json with session token stripped
                save(info_path, [meta])
        except Exception:
            pass

    # Save manifest
    manifest_path = os.path.join(out_dir, "_manifest.json")
    save(manifest_path, manifest)

    print(
        f"\nDone: {success} fetched, {failed} failed — "
        f"{human_bytes(total_bytes)} total → {out_dir}",
        file=sys.stderr,
    )
    if manifest.get("sc_version_live"):
        print(f"SC live version: {manifest['sc_version_live']}", file=sys.stderr)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
