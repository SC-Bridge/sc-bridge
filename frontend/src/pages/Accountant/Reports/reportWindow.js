// Stable, module-level default window: epoch start → now + 1 day.
// Computed ONCE at module load — never inside a render — so the strings are
// referentially stable and useGet (keyed on URL) never re-fires due to a new
// timestamp on each render (the BalanceSheet infinite-fetch-loop fix).
export const DEFAULT_FROM = '1970-01-01T00:00:00.000Z'
export const DEFAULT_TO = new Date(Date.now() + 86_400_000).toISOString()

/**
 * Return { from, to, qs } for a report page.
 *
 * If the URL params contain `from` and/or `to` they win; absent params fall
 * back to the stable module-level defaults.  The same inputs always produce
 * the same strings — stability is intentional and load-bearing.
 *
 * @param {URLSearchParams} params
 * @returns {{ from: string, to: string, qs: string }}
 */
export function reportWindowFromParams(params) {
  const from = params.get('from') ?? DEFAULT_FROM
  const to = params.get('to') ?? DEFAULT_TO
  const qs = new URLSearchParams({ from, to }).toString()
  return { from, to, qs }
}
