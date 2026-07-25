import { describe, it, expect } from 'vitest'
import { getBenchAdapter } from './benchAdapters'

// Real Gmni pistol recipe fragment (same fixture family as weaponBenchStats.test.js).
const WEAPON_BP = {
  slots: [{ modifiers: [{ key: 'weapon_damage', start_quality: 0, end_quality: 1000, modifier_at_start: 0.9, modifier_at_end: 1.1 }] }],
  base_stats: { damage: 10, rounds_per_minute: 600 },
}
const ARMOUR_BP = {
  slots: [{ modifiers: [{ key: 'armor_damagemitigation', start_quality: 0, end_quality: 1000, modifier_at_start: 0.9, modifier_at_end: 1.2 }] }],
  base_stats: { resist_physical: 0.2, temperature_min: -80, temperature_max: 120, weight: 12.5, armour_slot: 'core' },
}

describe('getBenchAdapter', () => {
  it('weapon adapter has attachments and computes weapon stats', () => {
    const a = getBenchAdapter('weapon')
    expect(a.kind).toBe('weapon')
    expect(a.hasAttachments).toBe(true)
    const stats = a.computeStats(WEAPON_BP, { 0: 1000 }, [])
    expect(stats.damage).toBeCloseTo(11, 3) // 10 × maxValue 1.1
  })

  it('armour adapter has no attachments and computes armour stats', () => {
    const a = getBenchAdapter('armour')
    expect(a.hasAttachments).toBe(false)
    const stats = a.computeStats(ARMOUR_BP, { 0: 1000 }, [])
    expect(stats.resist_physical).toBeCloseTo(0.24, 3) // 0.2 × maxValue 1.2
    expect(stats.weight).toBe(12.5)
  })

  it('unknown kind falls back to the weapon adapter', () => {
    expect(getBenchAdapter('mystery').kind).toBe('weapon')
  })
})
