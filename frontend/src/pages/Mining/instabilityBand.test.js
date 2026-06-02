import { describe, it, expect } from 'vitest'
import { instabilityBand } from './miningUtils'

describe('instabilityBand', () => {
  it('classifies the four bands by threshold', () => {
    expect(instabilityBand(36).label).toBe('Stable')      // iron-ish
    expect(instabilityBand(99).label).toBe('Stable')
    expect(instabilityBand(100).label).toBe('Twitchy')
    expect(instabilityBand(399).label).toBe('Twitchy')
    expect(instabilityBand(400).label).toBe('Volatile')
    expect(instabilityBand(699).label).toBe('Volatile')
    expect(instabilityBand(700).label).toBe('Extreme')
    expect(instabilityBand(1000).label).toBe('Extreme')   // quantainium-ish
  })

  it('carries a player-facing risk phrase + colour tokens', () => {
    const b = instabilityBand(36)
    expect(b.risk).toBe('low shatter risk')
    expect(b.text).toMatch(/emerald/)
    expect(b.dot).toMatch(/emerald/)
  })

  it('maps value to a 0–100% bar, clamped', () => {
    expect(instabilityBand(0).barPct).toBe(0)
    expect(instabilityBand(500).barPct).toBe(50)
    expect(instabilityBand(2000).barPct).toBe(100) // clamped
  })

  it('treats null/undefined as 0 → Stable', () => {
    expect(instabilityBand(null).label).toBe('Stable')
    expect(instabilityBand(undefined).label).toBe('Stable')
    expect(instabilityBand(null).barPct).toBe(0)
  })
})
