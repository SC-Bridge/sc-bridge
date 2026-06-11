// Pure: turn a report `drill` filter object into a Ledger deep-link.
// The M1 ledger GET reads category/source as REPEATABLE params (c.req.queries),
// so comma-lists are expanded into repeated keys.
//
// BOUNDARY NOTE (owner decision 2026-06-11): report periods are half-open
// (occurred_at >= from AND < to) while the M1 ledger GET treats `to` as
// INCLUSIVE (<= to). The same from/to are passed through unchanged, so a
// drilled-into Ledger view can include one extra entry occurring at exactly
// the ISO `to` instant that the report total excluded. Accepted; aligning the
// M1 ledger semantic is noted future work — do NOT change ledger.ts here.
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
