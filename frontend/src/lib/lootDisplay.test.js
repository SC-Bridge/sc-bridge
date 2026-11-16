import { describe, it, expect } from 'vitest'
import { formatMicroScu } from './lootDisplay'

// Matches the game's own wording, e.g. "Carrying Capacity: 180K µSCU".
describe('formatMicroScu', () => {
  it('shows thousands as K', () => {
    expect(formatMicroScu(180000)).toBe('180K µSCU')
    expect(formatMicroScu(8000)).toBe('8K µSCU')
  })

  it('keeps a half thousand instead of rounding it away', () => {
    expect(formatMicroScu(127500)).toBe('127.5K µSCU')
    expect(formatMicroScu(7500)).toBe('7.5K µSCU')
  })

  it('shows small values as plain µSCU', () => {
    expect(formatMicroScu(400)).toBe('400 µSCU')
  })

  it('returns null when there is no capacity', () => {
    expect(formatMicroScu(null)).toBeNull()
    expect(formatMicroScu(undefined)).toBeNull()
    expect(formatMicroScu(0)).toBeNull()
    expect(formatMicroScu('n/a')).toBeNull()
  })
})
