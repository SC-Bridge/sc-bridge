#!/usr/bin/env python3
"""
D1 write-budget estimator.

Pulls current month's rowsWritten from the Cloudflare Analytics API and
optionally estimates the writes a SQL file is about to apply. Exits non-zero
when projected usage exceeds a threshold so it can gate dangerous loads.

Usage:
  scripts/d1-budget.py --db scbridge-staging
  scripts/d1-budget.py --db scbridge-production --sql-file output/loot.sql
  scripts/d1-budget.py --db scbridge-staging --sql-file load.sql --threshold 60

Env:
  CLOUDFLARE_API_TOKEN  — token with Account Analytics:Read scope
  CLOUDFLARE_ACCOUNT_ID — defaults to SC Bridge account id
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

# Windows consoles default to cp1252; the report uses "→" and "—". Force UTF-8
# so the script doesn't crash before printing the budget.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

DEFAULT_ACCOUNT_ID = "92557ddeffaf43d64db74acf783ec49d"  # SC Bridge
FREE_TIER_WRITES_PER_MONTH = 50_000_000
GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"
DB_LIST_URL = "https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database?per_page=100"
ACCOUNT_URL = "https://api.cloudflare.com/client/v4/accounts/{acct}"


def fetch_billing_day(account_id: str, token: str) -> int:
    """CF billing rolls over on the day-of-month the account was created."""
    data = http_get(ACCOUNT_URL.format(acct=account_id), token)
    if not data.get("success"):
        raise RuntimeError(f"Account fetch failed: {data.get('errors')}")
    created = data["result"]["created_on"]  # ISO8601 e.g. 2026-04-02T03:40:35Z
    return int(created[8:10])


def billing_period(billing_day: int) -> tuple[str, str]:
    """Return [period_start, today] inclusive, given the rollover day-of-month."""
    today = date.today()
    if today.day >= billing_day:
        # Current period started this month on billing_day
        start = today.replace(day=billing_day)
    else:
        # Current period started last month on billing_day
        prev_month = today.replace(day=1) - timedelta(days=1)
        # Clamp billing_day to last day of prev_month if needed (e.g. day=31 in Feb)
        last_day = prev_month.day
        start = prev_month.replace(day=min(billing_day, last_day))
    return start.isoformat(), today.isoformat()


def http_post(url: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def http_get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def list_databases(account_id: str, token: str) -> dict[str, str]:
    """Return {db_name: db_id} for all D1s on the account."""
    data = http_get(DB_LIST_URL.format(acct=account_id), token)
    if not data.get("success"):
        raise RuntimeError(f"D1 list failed: {data.get('errors')}")
    return {db["name"]: db["uuid"] for db in data.get("result", [])}


def fetch_writes(account_id: str, token: str, db_id: str, since: str, until: str) -> int:
    """Sum rowsWritten for one database over [since, until]."""
    query = """
    query Writes($acct: String!, $db: String!, $since: Date!, $until: Date!) {
      viewer {
        accounts(filter: {accountTag: $acct}) {
          d1AnalyticsAdaptiveGroups(
            limit: 5000
            filter: {databaseId: $db, date_geq: $since, date_leq: $until}
          ) {
            sum { rowsWritten }
          }
        }
      }
    }
    """
    body = {
        "query": query,
        "variables": {"acct": account_id, "db": db_id, "since": since, "until": until},
    }
    data = http_post(GRAPHQL_URL, token, body)
    if data.get("errors"):
        raise RuntimeError(f"GraphQL errors: {data['errors']}")
    groups = data["data"]["viewer"]["accounts"][0]["d1AnalyticsAdaptiveGroups"]
    return sum(g["sum"]["rowsWritten"] for g in groups)


# ─────────────────────────── SQL row-write estimator ───────────────────────────

# Strip /* ... */ block comments and -- line comments. Keep string literals intact.
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT_RE = re.compile(r"--[^\n]*")


def strip_sql_comments(sql: str) -> str:
    sql = _BLOCK_COMMENT_RE.sub(" ", sql)
    sql = _LINE_COMMENT_RE.sub("", sql)
    return sql


def split_statements(sql: str) -> list[str]:
    """Split on top-level `;`, respecting single-quoted strings and parens."""
    out: list[str] = []
    buf: list[str] = []
    in_str = False
    paren_depth = 0
    i = 0
    while i < len(sql):
        ch = sql[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                # Handle escaped quote: '' inside string literal
                if i + 1 < len(sql) and sql[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
        else:
            if ch == "'":
                in_str = True
                buf.append(ch)
            elif ch == "(":
                paren_depth += 1
                buf.append(ch)
            elif ch == ")":
                paren_depth -= 1
                buf.append(ch)
            elif ch == ";" and paren_depth == 0:
                stmt = "".join(buf).strip()
                if stmt:
                    out.append(stmt)
                buf = []
            else:
                buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def count_value_tuples(stmt: str) -> int:
    """Count top-level `(...)` tuples in the VALUES clause of a statement.

    Stops counting once we leave the VALUES list — i.e. when depth returns to 0
    and the next non-whitespace token isn't `,` (start of another tuple).
    This avoids counting `ON CONFLICT (cols)` or `RETURNING (...)` clauses.
    """
    upper = stmt.upper()
    # Find VALUES not inside a string. Naive find is OK because identifiers/strings
    # rarely contain the literal word VALUES outside of an actual VALUES clause in
    # generated SQL.
    idx = upper.find("VALUES")
    if idx < 0:
        return 0
    body = stmt[idx + len("VALUES"):]
    count = 0
    depth = 0
    in_str = False
    in_tuple = False
    i = 0
    while i < len(body):
        ch = body[i]
        if in_str:
            if ch == "'":
                if i + 1 < len(body) and body[i + 1] == "'":
                    i += 2
                    continue
                in_str = False
        else:
            if ch == "'":
                in_str = True
            elif ch == "(":
                if depth == 0:
                    count += 1
                    in_tuple = True
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0 and in_tuple:
                    # Closed a tuple. Look ahead — if next non-whitespace is `,`
                    # we expect another tuple; otherwise the VALUES list is done.
                    j = i + 1
                    while j < len(body) and body[j].isspace():
                        j += 1
                    if j >= len(body) or body[j] != ",":
                        break
                    in_tuple = False
        i += 1
    return count


def classify_statement(stmt: str) -> tuple[str, int, str]:
    """
    Return (kind, estimated_rows, note).
    kind ∈ {"INSERT_VALUES", "INSERT_SELECT", "UPDATE", "DELETE", "DDL_OTHER"}
    """
    s = stmt.lstrip()
    head = s[:32].upper()
    if head.startswith("INSERT"):
        if "VALUES" in s.upper():
            n = count_value_tuples(s)
            if n == 0:
                return ("INSERT_VALUES", 1, "VALUES clause but zero tuples parsed (best-effort)")
            return ("INSERT_VALUES", n, "")
        if "SELECT" in s.upper():
            return ("INSERT_SELECT", 0, "INSERT...SELECT — row count unknown without execution")
        return ("INSERT_VALUES", 1, "")
    if head.startswith("REPLACE"):
        return ("INSERT_VALUES", count_value_tuples(s) or 1, "")
    if head.startswith("UPDATE"):
        return ("UPDATE", 1, "rows affected unknown — counted as ≥1 per statement")
    if head.startswith("DELETE"):
        return ("DELETE", 1, "rows affected unknown — counted as ≥1 per statement")
    return ("DDL_OTHER", 0, "")


def estimate_sql_writes(sql_text: str) -> dict:
    cleaned = strip_sql_comments(sql_text)
    stmts = split_statements(cleaned)
    counts = {"INSERT_VALUES": 0, "INSERT_SELECT": 0, "UPDATE": 0, "DELETE": 0, "DDL_OTHER": 0}
    rows = 0
    notes: list[str] = []
    uncertain = False
    for s in stmts:
        kind, n, note = classify_statement(s)
        counts[kind] += 1
        rows += n
        if kind == "INSERT_SELECT":
            uncertain = True
        if note and len(notes) < 5:
            notes.append(f"  {kind}: {note}")
    return {
        "statements": len(stmts),
        "counts": counts,
        "rows": rows,
        "uncertain": uncertain or counts["UPDATE"] > 0 or counts["DELETE"] > 0,
        "notes": notes,
    }


# ─────────────────────────────── CLI ───────────────────────────────


def fmt_n(n: int) -> str:
    return f"{n:,}"


def fmt_pct(n: int, total: int) -> str:
    return f"{(n / total * 100):.1f}%" if total else "—"


def main() -> int:
    p = argparse.ArgumentParser(description="D1 write-budget estimator")
    p.add_argument("--db", required=True, help="D1 database name (e.g. scbridge-staging)")
    p.add_argument("--sql-file", type=Path, help="Optional SQL file to estimate writes for")
    p.add_argument("--threshold", type=float, default=80.0,
                   help="Exit non-zero if projected usage exceeds this percent (default 80)")
    p.add_argument("--account-id", default=os.environ.get("CLOUDFLARE_ACCOUNT_ID", DEFAULT_ACCOUNT_ID))
    p.add_argument("--billing-day", type=int, default=None,
                   help="Day-of-month the billing period rolls over (default: derived from account created_on)")
    p.add_argument("--quiet", action="store_true", help="Suppress info output, print one-line summary")
    args = p.parse_args()

    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        print("ERROR: CLOUDFLARE_API_TOKEN not set in environment.", file=sys.stderr)
        return 2

    try:
        dbs = list_databases(args.account_id, token)
    except Exception as e:
        print(f"ERROR: failed to list D1 databases: {e}", file=sys.stderr)
        return 2

    if args.db not in dbs:
        print(f"ERROR: database {args.db!r} not found on account {args.account_id}.", file=sys.stderr)
        print(f"  Available: {', '.join(sorted(dbs.keys()))}", file=sys.stderr)
        return 2

    db_id = dbs[args.db]
    billing_day = args.billing_day
    if billing_day is None:
        try:
            billing_day = fetch_billing_day(args.account_id, token)
        except Exception as e:
            print(f"WARN: could not derive billing day ({e}); defaulting to 1.", file=sys.stderr)
            billing_day = 1
    since, until = billing_period(billing_day)

    try:
        used = fetch_writes(args.account_id, token, db_id, since, until)
    except Exception as e:
        print(f"ERROR: failed to fetch analytics: {e}", file=sys.stderr)
        return 2

    estimated = 0
    sql_summary = None
    if args.sql_file:
        if not args.sql_file.is_file():
            print(f"ERROR: SQL file not found: {args.sql_file}", file=sys.stderr)
            return 2
        sql_text = args.sql_file.read_text(encoding="utf-8", errors="replace")
        sql_summary = estimate_sql_writes(sql_text)
        estimated = sql_summary["rows"]

    projected = used + estimated
    cap = FREE_TIER_WRITES_PER_MONTH

    if args.quiet:
        print(f"{args.db}: used {fmt_n(used)} / {fmt_n(cap)} ({fmt_pct(used, cap)}); "
              f"this load: {fmt_n(estimated)}; projected: {fmt_pct(projected, cap)}")
    else:
        print(f"=== D1 Write Budget — {args.db} ({db_id}) ===")
        print(f"Billing period:    {since} → {until}")
        print(f"Used (this month): {fmt_n(used):>15}  ({fmt_pct(used, cap)} of {fmt_n(cap)})")
        if sql_summary:
            c = sql_summary["counts"]
            print(f"\nSQL file: {args.sql_file}")
            print(f"  Statements: {fmt_n(sql_summary['statements'])}")
            print(f"  INSERT…VALUES tuples: {fmt_n(c['INSERT_VALUES'])}  (≈ {fmt_n(estimated)} row writes)")
            if c["INSERT_SELECT"]:
                print(f"  INSERT…SELECT:        {fmt_n(c['INSERT_SELECT'])}  (row count unknown)")
            if c["UPDATE"]:
                print(f"  UPDATE statements:    {fmt_n(c['UPDATE'])}  (each ≥1 row)")
            if c["DELETE"]:
                print(f"  DELETE statements:    {fmt_n(c['DELETE'])}  (each ≥1 row — D1 bills deletes)")
            if c["DDL_OTHER"]:
                print(f"  DDL / other:          {fmt_n(c['DDL_OTHER'])}  (not row-billed)")
            if sql_summary["uncertain"]:
                print("  ⚠  Estimate is a lower bound — UPDATEs/DELETEs/INSERT…SELECT can write more.")
            for note in sql_summary["notes"]:
                print(note)
            print(f"\nProjected after this load: {fmt_n(projected):>15}  ({fmt_pct(projected, cap)} of cap)")
        else:
            print("(no SQL file given — showing current usage only)")

    pct = projected / cap * 100 if cap else 0
    if pct >= args.threshold:
        print(f"\n❌ Projected usage {pct:.1f}% ≥ threshold {args.threshold:.0f}%.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
