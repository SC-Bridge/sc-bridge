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
