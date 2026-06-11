#!/usr/bin/env bash
# Accountant M2 — loan lifecycle simulation (design §8 demo script).
# Exercises: create loan → read (triggers backdated accrual catch-up) →
# partial repayment → over-repayment rejection → settle.
#
# Prereqs:
#   1. Run the worker locally:  npx wrangler dev   (or `npm run dev` → BASE=http://localhost:5173)
#   2. Export an authenticated header. Either a session cookie from the web app:
#        export ACCT_AUTH='Cookie: better-auth.session_token=...'
#      or a bearer token from POST /api/auth/sign-in/email:
#        export ACCT_AUTH='Authorization: Bearer <token>'
#   3. export BASE=http://localhost:8787   (adjust to your dev port)
set -euo pipefail
BASE="${BASE:-http://localhost:8787}"
AUTH="${ACCT_AUTH:?export ACCT_AUTH with your session header}"
hdr=(-H "$AUTH" -H "Content-Type: application/json")

echo "== 1. Create an outgoing loan, backdated 5 days (so accrual catches up) =="
STARTED="$(date -u -d '5 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-5d +%Y-%m-%dT%H:%M:%SZ)"
CREATE=$(curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/loans" -d "{
  \"direction\":\"outgoing\",\"counterparty\":\"@pilot42\",\"principal\":100000,
  \"interest_rate\":10,\"interest_interval\":\"daily\",\"fee_multiplier\":1.5,
  \"started_at\":\"$STARTED\"
}")
echo "$CREATE"
LOAN_ID=$(echo "$CREATE" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
echo "Loan id = $LOAN_ID"

echo "== 2. Read the loan — this read runs lazy accrual catch-up (5 daily ticks) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/loans/$LOAN_ID" | tee /tmp/loan-detail.json
echo
echo "Expect: outstanding > 100000 (principal + fee + 5 compounding ticks), preview.nextTickAt set."

echo "== 3. Confirm the accrual ticks are in the ledger (filter to accrual_tick) =="
curl -s "${hdr[@]}" "$BASE/api/accountant/ledger?source=accrual_tick" | tee /tmp/ticks.json
echo
echo "Expect: 5 accrual_tick rows, tick_index 1..5, compounding amounts."

echo "== 4. Partial repayment of 40000 =="
curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/loans/$LOAN_ID/repayments" \
  -d "{\"amount\":40000,\"occurred_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | tee /tmp/repay1.json
echo

echo "== 5. Over-repayment (huge) must 400 and echo outstanding =="
curl -s -o /tmp/overpay.json -w "HTTP %{http_code}\n" "${hdr[@]}" -X POST \
  "$BASE/api/accountant/loans/$LOAN_ID/repayments" \
  -d "{\"amount\":999999999,\"occurred_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
cat /tmp/overpay.json; echo
echo "Expect: HTTP 400 with { \"error\":..., \"outstanding\": <current> }."

echo "== 6. Settle the loan (remaining outstanding becomes a write-off) =="
curl -s "${hdr[@]}" -X POST "$BASE/api/accountant/loans/$LOAN_ID/settle" | tee /tmp/settle.json
echo

echo "== 7. Badges — loansDueSoon should reflect any due_at within 48h =="
curl -s "${hdr[@]}" "$BASE/api/accountant/badges"; echo

echo "== DONE — review /tmp/*.json. Determinism check: re-run step 2; tick rows must NOT change. =="
