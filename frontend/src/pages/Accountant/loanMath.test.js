import { describe, it, expect } from 'vitest'
import { projectedNextTick, paybackTotal, INTERVAL_LABELS } from './loanMath'

describe('loanMath', () => {
  it('projectedNextTick = round(outstanding * rate / 100)', () => {
    expect(projectedNextTick(100000, 5)).toBe(5000)
    expect(projectedNextTick(60000, 10)).toBe(6000)
    expect(projectedNextTick(0, 10)).toBe(0)
  })

  it('paybackTotal = outstanding + projected next tick', () => {
    expect(paybackTotal(100000, 5)).toBe(105000)
  })

  it('exposes human labels for every interval', () => {
    expect(INTERVAL_LABELS.monthly).toBe('Monthly')
    expect(Object.keys(INTERVAL_LABELS)).toEqual(['hourly', 'daily', 'weekly', 'monthly'])
  })
})
