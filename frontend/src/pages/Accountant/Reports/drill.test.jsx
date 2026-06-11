import { describe, it, expect } from 'vitest'
import { drillToLedger } from './drill'

describe('drillToLedger', () => {
  it('builds a ledger query string from a drill filter object', () => {
    const href = drillToLedger({ from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z', category: 'trading', tag: 'minerals' })
    expect(href.startsWith('/accountant/ledger?')).toBe(true)
    expect(href).toContain('category=trading')
    expect(href).toContain('tag=minerals')
    expect(href).toContain('from=2026-06-01T00%3A00%3A00Z')
  })
  it('passes a comma source list through (interest lines)', () => {
    const href = drillToLedger({ from: 'a', to: 'b', source: 'accrual_tick,loan_fee' })
    expect(href).toContain('source=accrual_tick')
    expect(href).toContain('source=loan_fee') // expanded to repeatable params (ledger GET reads queries())
  })
})
