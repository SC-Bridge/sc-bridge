// Stable, module-level default window: epoch start → far future.
// Both are fixed constants (not computed at runtime) so useGet URL keys are
// referentially stable forever — tabs open for days never silently drop new
// entries from "all-time" reports (the now+1d staleness fix).
// The backend accepts any future timestamp; defaultInterval resolves monthly
// regardless of how far out DEFAULT_TO is.
export const DEFAULT_FROM = '1970-01-01T00:00:00.000Z'
export const DEFAULT_TO = '2999-01-01T00:00:00.000Z'

/**
 * Return { from, to, qs } for a report page.
 *
 * If the URL params contain `from` and/or `to` they win; absent params fall
 * back to the stable module-level defaults.  The same inputs always produce
 * the same strings — stability is intentional and load-bearing.
 *
 * If the URL params contain `interval` it is forwarded verbatim in `qs`
 * (the backend validates and 400s on unknown values).  Absent `interval`
 * is omitted so the backend applies its window-length default.
 *
 * @param {URLSearchParams} params
 * @returns {{ from: string, to: string, qs: string }}
 */
export function reportWindowFromParams(params) {
  const from = params.get('from') ?? DEFAULT_FROM
  const to = params.get('to') ?? DEFAULT_TO
  const interval = params.get('interval')
  const base = { from, to }
  if (interval) base.interval = interval
  const qs = new URLSearchParams(base).toString()
  return { from, to, qs }
}
