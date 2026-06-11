// Pure loan display math — mirrors the backend's per-tick formula so the
// LoanDetail preview matches what the next catch-up will actually post.
export const INTERVAL_LABELS = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export const INTERVAL_SHORT = {
  hourly: '/hr',
  daily: '/day',
  weekly: '/wk',
  monthly: '/mo',
}

// round(outstanding * rate / 100) — same rounding as accrual.ts.
export function projectedNextTick(outstanding, rate) {
  return Math.round((outstanding * rate) / 100)
}

export function paybackTotal(outstanding, rate) {
  return outstanding + projectedNextTick(outstanding, rate)
}
