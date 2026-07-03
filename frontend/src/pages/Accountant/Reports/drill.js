// Pure: turn a report `drill` filter object into a Ledger deep-link.
// The M1 ledger GET reads category/source as REPEATABLE params (c.req.queries),
// so comma-lists are expanded into repeated keys.
//
// BOUNDARY NOTE: report periods and the ledger GET are both half-open on `to`
// (occurred_at >= from AND < to — see routes/accountant/ledger.ts, which pins
// its upper bound to report-period.ts). The same from/to pass through unchanged,
// so a drilled-into Ledger view and the report total agree at window boundaries.
export function drillToLedger(drill) {
  const p = new URLSearchParams()
  for (const [key, val] of Object.entries(drill)) {
    if (val == null || val === '') continue
    if ((key === 'category' || key === 'source') && String(val).includes(',')) {
      for (const v of String(val).split(',')) p.append(key, v)
    } else {
      p.set(key, val)
    }
  }
  return `/accountant/ledger?${p.toString()}`
}
