import { describe, it, expect } from 'vitest'
import { formatAUEC, signClass } from './formatAUEC'

describe('formatAUEC', () => {
  it('formats with thousands separators', () => {
    expect(formatAUEC(12480293)).toBe('12,480,293 aUEC')
  })
  it('formats negatives with a leading minus', () => {
    expect(formatAUEC(-3200)).toBe('-3,200 aUEC')
  })
  it('formats zero', () => {
    expect(formatAUEC(0)).toBe('0 aUEC')
  })
  it('signClass maps sign to color token classes', () => {
    expect(signClass(5)).toBe('text-sc-success')
    expect(signClass(-5)).toBe('text-sc-danger')
    expect(signClass(0)).toBe('text-gray-400')
  })
})

describe('formatAUEC short variant', () => {
  it('below 1M short is identical to full form', () => {
    expect(formatAUEC(999_999, { short: true })).toBe('999,999 aUEC')
  })
  it('exactly 1M short → 1M aUEC (no trailing .0)', () => {
    expect(formatAUEC(1_000_000, { short: true })).toBe('1M aUEC')
  })
  it('1,234,567 short → 1.2M aUEC', () => {
    expect(formatAUEC(1_234_567, { short: true })).toBe('1.2M aUEC')
  })
  it('-1,500,000 short → -1.5M aUEC', () => {
    expect(formatAUEC(-1_500_000, { short: true })).toBe('-1.5M aUEC')
  })
  it('2,000,000 short → 2M aUEC (no trailing .0)', () => {
    expect(formatAUEC(2_000_000, { short: true })).toBe('2M aUEC')
  })
  it('no options → existing full behavior unchanged', () => {
    expect(formatAUEC(1_234_567)).toBe('1,234,567 aUEC')
    expect(formatAUEC(-1_500_000)).toBe('-1,500,000 aUEC')
  })
})
