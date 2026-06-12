import { describe, it, expect } from 'vitest'
import { formatAUEC, parseAUEC, signClass, toneBySign } from './formatAUEC'

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
  it('toneBySign maps positive/negative/zero to tone strings', () => {
    expect(toneBySign(100)).toBe('positive')
    expect(toneBySign(-100)).toBe('negative')
    expect(toneBySign(0)).toBe('neutral')
  })
})

describe('parseAUEC', () => {
  it('parses plain digit strings', () => {
    expect(parseAUEC('3200')).toBe(3200)
    expect(parseAUEC('0')).toBe(0)
  })
  it('accepts comma/space group separators', () => {
    expect(parseAUEC('1,084,999')).toBe(1084999)
    expect(parseAUEC('1 084 999')).toBe(1084999)
  })
  it('accepts a leading minus', () => {
    expect(parseAUEC('-45000')).toBe(-45000)
  })
  it('rejects scientific notation — parseInt would silently truncate 1e5 to 1', () => {
    expect(parseAUEC('1e5')).toBeNull()
    expect(parseAUEC('1E5')).toBeNull()
  })
  it('rejects decimals, garbage and blanks', () => {
    expect(parseAUEC('12.5')).toBeNull()
    expect(parseAUEC('12abc')).toBeNull()
    expect(parseAUEC('')).toBeNull()
    expect(parseAUEC('   ')).toBeNull()
    expect(parseAUEC('-')).toBeNull()
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
