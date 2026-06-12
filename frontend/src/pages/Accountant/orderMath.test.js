import { describe, it, expect } from 'vitest'
import { orderTotal, effectiveRate, fulfillmentPreview, modifiedContractFields, orderRef, woRef } from './orderMath'
import { ORDER_TEMPLATE } from './constants'

describe('orderMath — mirrors the backend formulas exactly', () => {
  it('orderTotal = round(quantity × price_per_unit)', () => {
    expect(orderTotal(200, 3200)).toBe(640000)
    expect(orderTotal(7, 333)).toBe(2331)
    expect(orderTotal(0.5, 333)).toBe(167)        // round, not floor — REAL quantities
  })
  it('effectiveRate: late triggers after deliver_by; partial triggers once anything fulfilled', () => {
    const base = { price_per_unit: 1000, deliver_by: '2026-06-11T00:00:00Z', rate_change_condition: 'late', rate_change_pct: 10 }
    expect(effectiveRate(base, { occurredAtMs: Date.parse('2026-06-10T00:00:00Z'), fulfilledQty: 0 })).toBe(1000)
    expect(effectiveRate(base, { occurredAtMs: Date.parse('2026-06-12T00:00:00Z'), fulfilledQty: 0 })).toBe(1100)
    const partial = { ...base, rate_change_condition: 'partial' }
    expect(effectiveRate(partial, { occurredAtMs: 0, fulfilledQty: 30 })).toBe(1100)
    expect(effectiveRate({ ...base, rate_change_condition: null }, { occurredAtMs: Infinity, fulfilledQty: 9 })).toBe(1000)
  })
  it('fulfillmentPreview = round(qty × effective rate) — 50 × 1100 → 55,000', () => {
    expect(fulfillmentPreview(50, 1100)).toBe(55000)
  })
  it('modifiedContractFields diffs against ORDER_TEMPLATE (the "← modified" markers)', () => {
    expect(modifiedContractFields({ ...ORDER_TEMPLATE })).toEqual([])
    expect(modifiedContractFields({ ...ORDER_TEMPLATE, deliver_by: '2026-06-20T00:00:00Z', fine_rate: 1.5 }).sort())
      .toEqual(['deliver_by', 'fine_rate'])
  })
  it('refs: orderRef(82) → O-82 ; woRef(7) → W-0007', () => {
    expect(orderRef(82)).toBe('O-82')
    expect(woRef(7)).toBe('W-0007')
  })
})
