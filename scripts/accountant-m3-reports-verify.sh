#!/usr/bin/env bash
# Accountant M3 — reports verification (design §8 demo script).
# Seeds a small known ledger, then reads all five report endpoints and prints
# the figures so they can be checked against hand-computed golden numbers.
# Golden figures below assume a FRESH account; on a dirty dev DB verify the
# cross-report invariants instead (printed at the end).
#
# Prereqs:
#   1. npx wrangler dev   (or `npm run dev` → BASE=http://localhost:5173)
#   2. export ACCT_AUTH='Cookie: better-auth.session_token=...'   (log in, copy cookie)
#      or ACCT_AUTH='Authorization: Bearer <token>'
#   3. export BASE=http://localhost:8787
set -euo pipefail
BASE="${BASE:-http://localhost:8787}"
AUTH="${ACCT_AUTH:?export ACCT_AUTH with your session header}"
hdr=(-H "$AUTH" -H "Content-Type: application/json")
FROM="2026-06-01T00:00:00Z"; TO="2026-07-01T00:00:00Z"

post_entry() { # amount category [tag] [occurred_at]
  local tag=null
  [ -n "${3:-}" ] && tag="\"$3\""
  curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/ledger" -d "{
    \"amount\":$1,\"category\":\"$2\",\"tag\":$tag,
    \"occurred_at\":\"${4:-2026-06-15T12:00:00Z}\"}" >/dev/null
}

echo "== Seed a known June-2026 ledger =="
post_entry 4200000 trading minerals
post_entry 320000 production
post_entry 45000 mission_income
post_entry -280000 running_cost ship_consumables
post_entry -1400000 production specified
post_entry -80000 financial tactical
post_entry 1200000 assets    # balance sheet only — excluded from P&L

echo "== 1. P&L (fresh account expects: revenue 4,565,000 / expenses -1,760,000 / net 2,805,000) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/reports/pl?from=$FROM&to=$TO" | tee /tmp/pl.json; echo
echo "== 2. Balance sheet at $TO (fresh account expects assets 1,200,000; liabilities = open incoming-loan net only) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/reports/balance?at=$TO" | tee /tmp/balance.json; echo
echo "== 3. Net-worth series (weekly buckets for a 30d window) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/reports/net-worth?from=$FROM&to=$TO" | tee /tmp/networth.json; echo
echo "== 4. Cash-flow series (excludes adjustment source only) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/reports/cash-flow?from=$FROM&to=$TO" | tee /tmp/cashflow.json; echo
echo "== 5. Investment option (defaults to the current calendar month) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/reports/investment-option" | tee /tmp/invopt.json; echo
echo "== DONE — invariants to verify in /tmp/*.json: =="
echo "   balance.netWorth == last net-worth series point.netWorth (at the same instant)"
echo "   each cash-flow bucket: in + out == net"
echo "   P&L net == revenue.total + expenses.total"
