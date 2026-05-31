import { describe, it, expect } from 'vitest'
import { formatStaleness, resolveLocationEntry } from './lootHelpers'

// 2026-06-01 UTC — anchor for deterministic age calculations.
const NOW = Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000)

describe('formatStaleness', () => {
  it('returns null for missing or invalid input', () => {
    expect(formatStaleness(null, NOW)).toBeNull()
    expect(formatStaleness(undefined, NOW)).toBeNull()
    expect(formatStaleness(0, NOW)).toBeNull()
    expect(formatStaleness('not-a-number', NOW)).toBeNull()
  })

  it('uses <1m for fresh reports (under 60s)', () => {
    expect(formatStaleness(NOW - 0, NOW)).toBe('<1m')
    expect(formatStaleness(NOW - 30, NOW)).toBe('<1m')
    expect(formatStaleness(NOW - 59, NOW)).toBe('<1m')
  })

  it('uses minutes for under-1-hour reports', () => {
    expect(formatStaleness(NOW - 60, NOW)).toBe('1m')
    expect(formatStaleness(NOW - 60 * 17, NOW)).toBe('17m')
    expect(formatStaleness(NOW - (3600 - 1), NOW)).toBe('59m')
  })

  it('uses hours for under-1-day reports', () => {
    expect(formatStaleness(NOW - 3600, NOW)).toBe('1h')
    expect(formatStaleness(NOW - 3600 * 9, NOW)).toBe('9h')
    expect(formatStaleness(NOW - (86400 - 1), NOW)).toBe('23h')
  })

  it('uses days for older reports', () => {
    expect(formatStaleness(NOW - 86400, NOW)).toBe('1d')
    expect(formatStaleness(NOW - 86400 * 17, NOW)).toBe('17d')
    expect(formatStaleness(NOW - 86400 * 365, NOW)).toBe('365d')
  })

  it('clamps negative ages (future timestamps) to <1m', () => {
    expect(formatStaleness(NOW + 60, NOW)).toBe('<1m')
  })
})

describe('resolveLocationEntry — shops with UEX staleness', () => {
  it('appends the staleness badge when uex_date_modified is present', () => {
    // 17 days ago at the time of the test mount (uses real now, so a wider
    // tolerance check). We assert the bracketed suffix shape, not the exact
    // value (since we can't inject `now` into the resolver from here).
    const seventeenDaysAgo = Math.floor(Date.now() / 1000) - 86400 * 17
    const r = resolveLocationEntry(
      {
        shop_name: 'CenterMass Area 18',
        buy_price: 15000,
        sell_price: 18000,
        uex_date_modified: seventeenDaysAgo,
      },
      'shops',
    )
    expect(r.detail).toContain('Buy: 15,000 · Sell: 18,000 aUEC')
    expect(r.detail).toMatch(/\(17d\)$/)
  })

  it('omits the staleness badge when uex_date_modified is absent', () => {
    const r = resolveLocationEntry(
      { shop_name: 'CenterMass Area 18', buy_price: 100, sell_price: 200 },
      'shops',
    )
    expect(r.detail).toBe('Buy: 100 · Sell: 200 aUEC')
    expect(r.detail).not.toMatch(/\(.*\)$/)
  })

  it('does not append staleness when prices are missing (detail = "Price unknown")', () => {
    const r = resolveLocationEntry(
      {
        shop_name: 'CenterMass Area 18',
        uex_date_modified: Math.floor(Date.now() / 1000) - 86400 * 5,
      },
      'shops',
    )
    expect(r.detail).toBe('Price unknown')
  })
})
