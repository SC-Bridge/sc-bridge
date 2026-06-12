#!/usr/bin/env bash
# Accountant M5 — order/workorder/forgiveness lifecycle simulation (plan Task 18).
# Exercises: seed adjustment → PO fund-check reject + accept → reserve visible in
# ledger → backdated percent fine catch-up → partial fulfilment (effective rate) →
# cancel releases the remainder (reserve nets to 0) → flat fines on the sale side →
# workorder compose/publish → component fulfilments → partial terminate (mandatory
# note + settlement) → completion summary (0-amount) → loan forgiveness (success +
# over-forgive 400) → determinism re-read.
#
# Golden absolute figures assume a FRESH account; on a dirty dev DB this script
# verifies the cross-entity INVARIANTS instead (M2/M3 convention): per-order
# reserve nets to exactly 0, sale-creation neutrality, fine tick counts/amounts
# from the backdated deliver_by, the forgiveness outstanding echo, and re-read
# determinism. The fund-check reject self-scales: it asks for available
# + 1,000,000 (which IS the plan's 2,000,000 on a fresh account post-seed).
#
# Prereqs:
#   1. Run the worker locally:  npx wrangler dev   (or `npm run dev` → BASE=http://localhost:5173)
#   2. Export an authenticated header. Either a session cookie from the web app:
#        export ACCT_AUTH='Cookie: better-auth.session_token=...'
#      or a bearer token from POST /api/auth/sign-in/email:
#        export ACCT_AUTH='Authorization: Bearer <token>'
#   3. export BASE=http://localhost:8787   (adjust to your dev port)
#   4. curl + jq on PATH.
set -euo pipefail
BASE="${BASE:-http://localhost:8787}"
AUTH="${ACCT_AUTH:?export ACCT_AUTH with your session header}"
hdr=(-H "$AUTH" -H "Content-Type: application/json")
command -v jq >/dev/null || { echo "jq is required on PATH"; exit 1; }

FAILS=0
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 = $2"
  else
    echo "  FAIL  $1: got [$2], want [$3]"
    FAILS=$((FAILS + 1))
  fi
}

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DELIVER3="$(date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-3d +%Y-%m-%dT%H:%M:%SZ)"
DELIVER2="$(date -u -d '2 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2d +%Y-%m-%dT%H:%M:%SZ)"

echo "== 0. Baseline snapshot (deltas, not absolutes — dirty-DB convention) =="
SNAP0=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders")
BAL0=$(echo "$SNAP0" | jq -r .balance)
LOCKED0=$(echo "$SNAP0" | jq -r .lockedInPOs)
echo "balance=$BAL0 lockedInPOs=$LOCKED0"

echo "== 1. Seed: +1,000,000 balance adjustment =="
curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/ledger" -d "{
  \"amount\":1000000,\"occurred_at\":\"$NOW\",\"adjustment\":true,
  \"description\":\"M5 lifecycle sim seed\"}" | tee /tmp/m5-seed.json
echo

echo "== 2. Fund check REJECT — PO over available balance must 400 with the echo =="
BAL1=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders" | jq -r .balance)
REQ=$((BAL1 + 1000000))
if [ "$REQ" -lt 2000000 ]; then REQ=2000000; fi
echo "(available=$BAL1 → asking for $REQ; on a fresh account this is the plan's 2,000,000)"
CODE=$(curl -s -o /tmp/m5-reject.json -w "%{http_code}" "${hdr[@]}" -X POST "$BASE/api/accountant/orders" -d "{
  \"type\":\"purchase\",\"category\":\"production\",\"item\":\"Oversized refinery contract\",
  \"quantity\":1,\"price_per_unit\":$REQ,\"start_at\":\"$NOW\"}")
cat /tmp/m5-reject.json; echo
check "reject HTTP status" "$CODE" "400"
check "reject echoes required" "$(jq -r .required /tmp/m5-reject.json)" "$REQ"
echo "Expect: {error: Insufficient funds, balance, lockedInPOs, required} — no order/reserve row written."

echo "== 3. Fund check ACCEPT — PO 100 x 1,000, deliver_by 3 days ago, percent 0.5/daily =="
PO_ID=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders" -d "{
  \"type\":\"purchase\",\"category\":\"production\",\"item\":\"Quantanium refinement batch\",
  \"quantity\":100,\"price_per_unit\":1000,\"counterparty\":\"@m5-sim\",
  \"start_at\":\"$NOW\",\"deliver_by\":\"$DELIVER3\",
  \"fine_interval\":\"daily\",\"fine_rate_type\":\"percent\",\"fine_rate\":0.5,
  \"rate_change_condition\":null}" | jq -r .id)
echo "PO id = $PO_ID"
RESERVE=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=po_reserve" |
  jq --argjson id "$PO_ID" '[.entries[] | select(.order_id == $id)][0]')
echo "$RESERVE" | tee /tmp/m5-po-reserve.json; echo
check "po_reserve entry amount" "$(echo "$RESERVE" | jq -r .amount)" "-100000"
SNAP1=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders")
check "lockedInPOs delta" "$(($(echo "$SNAP1" | jq -r .lockedInPOs) - LOCKED0))" "100000"
echo "Footer: balance=$(echo "$SNAP1" | jq -r .balance) locked=$(echo "$SNAP1" | jq -r .lockedInPOs)"
echo "Fresh-account golden: balance 900,000 / locked 100,000 (here: deltas verified instead)."

echo "== 4. Backdated fine catch-up (percent) — read triggers 3 ticks of +500 =="
PO_DETAIL=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$PO_ID")
echo "$PO_DETAIL" > /tmp/m5-po-detail.json
PO_FINES_1=$(echo "$PO_DETAIL" | jq -c '[.fines[] | {tick_index, amount}]')
echo "PO fines: $PO_FINES_1"
check "percent fine ticks" "$PO_FINES_1" '[{"tick_index":1,"amount":500},{"tick_index":2,"amount":500},{"tick_index":3,"amount":500}]'
LEDGER_PO_FINES=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=contract_fine" |
  jq --argjson id "$PO_ID" '[.entries[] | select(.order_id == $id)] | length')
check "contract_fine rows in ledger" "$LEDGER_PO_FINES" "3"
echo "Expect: 0.5% of the unfulfilled 100,000 = +500/day x 3 (purchase: their lateness is your income)."

echo "== 5. Partial fulfilment — 40 units at the effective rate =="
echo "Effective rate (no rate_change_condition): $(echo "$PO_DETAIL" | jq -r .computed.effectiveRate) (= price_per_unit)"
FUL1=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders/$PO_ID/fulfillments" -d '{"quantity":40}')
echo "$FUL1" | tee /tmp/m5-po-fulfil.json; echo
check "fulfilment amount" "$(echo "$FUL1" | jq -r .amount)" "-40000"
check "proportional reserve release" "$(echo "$FUL1" | jq -r .release)" "40000"
check "order status" "$(echo "$FUL1" | jq -r .status)" "in_progress"
OPEN_AFTER=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$PO_ID" | jq -r .reserve.open)
check "open reserve after partial" "$OPEN_AFTER" "60000"
echo "Expect: order_fulfillment -40,000 + po_reserve_release +40,000; locked drops to 60,000."

echo "== 6. Cancel — releases the remainder; closed order nets to EXACTLY 0 =="
CANCEL=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders/$PO_ID/cancel")
echo "$CANCEL" | tee /tmp/m5-po-cancel.json; echo
check "released remainder" "$(echo "$CANCEL" | jq -r .released)" "60000"
PO_RESERVE_FINAL=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$PO_ID" | jq -c .reserve)
echo "Final reserve state: $PO_RESERVE_FINAL"
check "reserve invariant (nets to 0)" "$(echo "$PO_RESERVE_FINAL" | jq -r .open)" "0"
echo "Invariant 1: per order, sum(po_reserve) + sum(po_reserve_release) = 0 once closed."

echo "== 7. Flat fine (sale side) — 10 x 5,000, deliver_by 2 days ago, flat 2,500/daily =="
SALE_ID=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders" -d "{
  \"type\":\"sale\",\"category\":\"trading\",\"item\":\"Laranite consignment\",
  \"quantity\":10,\"price_per_unit\":5000,\"counterparty\":\"@m5-sim\",
  \"start_at\":\"$NOW\",\"deliver_by\":\"$DELIVER2\",
  \"fine_interval\":\"daily\",\"fine_rate_type\":\"flat\",\"fine_rate\":2500}" | jq -r .id)
echo "Sale id = $SALE_ID"
SALE_DETAIL=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$SALE_ID")
echo "$SALE_DETAIL" > /tmp/m5-sale-detail.json
SALE_FINES_1=$(echo "$SALE_DETAIL" | jq -c '[.fines[] | {tick_index, amount}]')
echo "Sale fines: $SALE_FINES_1"
check "flat fine ticks" "$SALE_FINES_1" '[{"tick_index":1,"amount":-2500},{"tick_index":2,"amount":-2500}]'
check "sale neutrality: no reserve" "$(echo "$SALE_DETAIL" | jq -r .reserve.reserved)" "0"
check "sale neutrality: no fulfilments" "$(echo "$SALE_DETAIL" | jq -r '.fulfillments | length')" "0"
echo "Expect: a sale posts NOTHING at creation (owner ruling); only the 2 x -2,500 overdue fines on read."

echo "== 8. Workorder — compose with two inline orders, publish, first fulfilment =="
WO_ID=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/workorders" -d "{
  \"title\":\"M5 sim - refit package\",\"counterparty\":\"@m5-sim\",\"start_at\":\"$NOW\",
  \"orders\":[
    {\"type\":\"purchase\",\"category\":\"production\",\"item\":\"Hull plating\",
     \"quantity\":80,\"price_per_unit\":1000,\"start_at\":\"$NOW\"},
    {\"type\":\"sale\",\"category\":\"trading\",\"item\":\"Refit delivery\",
     \"quantity\":4,\"price_per_unit\":123000,\"start_at\":\"$NOW\"}]}" | jq -r .id)
echo "Workorder id = $WO_ID"
WO_DETAIL=$(curl -s "${hdr[@]}" "$BASE/api/accountant/workorders/$WO_ID")
echo "$WO_DETAIL" > /tmp/m5-wo-detail.json
WP_ID=$(echo "$WO_DETAIL" | jq -r '.components[] | select(.type == "purchase") | .id')
WS_ID=$(echo "$WO_DETAIL" | jq -r '.components[] | select(.type == "sale") | .id')
echo "Components: purchase=$WP_ID (80,000) sale=$WS_ID (492,000)"
check "workorder starts draft" "$(echo "$WO_DETAIL" | jq -r .workorder.status)" "draft"
curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/workorders/$WO_ID/publish"; echo
WFUL1=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders/$WP_ID/fulfillments" -d '{"quantity":40}')
echo "$WFUL1"
check "component fulfilment amount" "$(echo "$WFUL1" | jq -r .amount)" "-40000"
WO_STATUS=$(curl -s "${hdr[@]}" "$BASE/api/accountant/workorders/$WO_ID" | jq -r .workorder.status)
check "workorder flips in_progress" "$WO_STATUS" "in_progress"

echo "== 9. Partial terminate (sale leg only) — mandatory note + settlement; then complete =="
TERM=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/workorders/$WO_ID/terminate" -d "{
  \"note\":\"dropped this leg\",\"terminated_by\":\"counterparty\",
  \"settlement_amount\":25000,\"order_ids\":[$WS_ID]}")
echo "$TERM" | tee /tmp/m5-wo-terminate.json; echo
check "settlement amount" "$(echo "$TERM" | jq -r .settlement)" "25000"
check "WO still in_progress after partial" "$(echo "$TERM" | jq -r .workorderStatus)" "in_progress"
echo "(server suggestion was: $(echo "$TERM" | jq -r .suggestion) — your incurred costs in the terminated scope)"
SETTLE_ENTRY=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=wo_settlement" |
  jq --argjson id "$WO_ID" -c '[.entries[] | select(.workorder_id == $id)][0] | {amount, notes, description}')
echo "wo_settlement entry: $SETTLE_ENTRY"
check "settlement signed + (counterparty forfeits)" "$(echo "$SETTLE_ENTRY" | jq -r .amount)" "25000"
check "mandatory note carried" "$(echo "$SETTLE_ENTRY" | jq -r .notes)" "dropped this leg"
echo "-- now fulfil the remaining 40 on the purchase: last open component closes → completion --"
WFUL2=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/orders/$WP_ID/fulfillments" -d '{"quantity":40}')
echo "$WFUL2"
check "closing fulfilment status" "$(echo "$WFUL2" | jq -r .status)" "complete"
check "closing release (reserve nets to 0)" "$(echo "$WFUL2" | jq -r .release)" "40000"
check "workorder completes" "$(curl -s "${hdr[@]}" "$BASE/api/accountant/workorders/$WO_ID" | jq -r .workorder.status)" "complete"
SUMMARY=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=workorder_summary" |
  jq --argjson id "$WO_ID" -c '[.entries[] | select(.workorder_id == $id)][0] | {amount, description}')
echo "workorder_summary entry: $SUMMARY" | tee /tmp/m5-wo-summary.json
check "summary is 0-amount" "$(echo "$SUMMARY" | jq -r .amount)" "0"
echo "Expect description: 'W-$(printf '%04d' "$WO_ID") · 2 orders · net -80,000' (components posted as they fulfilled)."

echo "== 10. Loan forgiveness — outgoing 100,000 @ 0%: forgive 40,000, then over-forgive 400 =="
LOAN_ID=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/loans" -d "{
  \"direction\":\"outgoing\",\"counterparty\":\"@m5-sim\",\"principal\":100000,
  \"interest_rate\":0,\"interest_interval\":\"daily\",\"started_at\":\"$NOW\"}" | jq -r .id)
echo "Loan id = $LOAN_ID"
FORGIVE=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/loans/$LOAN_ID/forgive" \
  -d '{"amount":40000,"notes":"goodwill write-down"}')
echo "$FORGIVE" | tee /tmp/m5-forgive.json; echo
check "outstanding after forgive" "$(echo "$FORGIVE" | jq -r .outstanding)" "60000"
check "not auto-settled" "$(echo "$FORGIVE" | jq -r .settled)" "false"
FORGIVE_ENTRY=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=loan_forgiveness" |
  jq --argjson id "$LOAN_ID" -r '[.entries[] | select(.loan_id == $id)][0].amount')
check "forgiveness sign (outgoing = loss)" "$FORGIVE_ENTRY" "-40000"
CODE=$(curl -s -o /tmp/m5-overforgive.json -w "%{http_code}" "${hdr[@]}" -X POST \
  "$BASE/api/accountant/loans/$LOAN_ID/forgive" -d '{"amount":999999}')
cat /tmp/m5-overforgive.json; echo
check "over-forgive HTTP status" "$CODE" "400"
check "over-forgive echoes outstanding" "$(jq -r .outstanding /tmp/m5-overforgive.json)" "60000"

echo "== 11. Determinism re-read — re-running reads changes NOTHING =="
PO_FINES_2=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$PO_ID" | jq -c '[.fines[] | {tick_index, amount}]')
SALE_FINES_2=$(curl -s "${hdr[@]}" "$BASE/api/accountant/orders/$SALE_ID" | jq -c '[.fines[] | {tick_index, amount}]')
check "PO fine rows identical on re-read" "$PO_FINES_2" "$PO_FINES_1"
check "sale fine rows identical on re-read" "$SALE_FINES_2" "$SALE_FINES_1"
CNT_A=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=contract_fine" | jq -r .total)
CNT_B=$(curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=contract_fine" | jq -r .total)
check "ledger contract_fine count stable" "$CNT_B" "$CNT_A"
curl -s "${hdr[@]}" "$BASE/api/accountant/orders" | jq '{total, balance, lockedInPOs}'
echo "Re-run this section any number of times: row counts and amounts must be identical."

echo "== DONE — demo data left in the DB: PO=$PO_ID (cancelled), sale=$SALE_ID (open, fining),"
echo "   workorder=$WO_ID (complete, partial-terminated sale leg $WS_ID), loan=$LOAN_ID (60,000 outstanding)."
echo "   Review /tmp/m5-*.json for the raw payloads."
if [ "$FAILS" -gt 0 ]; then echo "RESULT: $FAILS check(s) FAILED"; exit 1; fi
echo "RESULT: all checks passed"
