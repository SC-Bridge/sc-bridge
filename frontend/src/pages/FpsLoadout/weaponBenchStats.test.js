import { describe, it, expect } from 'vitest'
import {
  craftedMultipliers, resolveAttachmentMultipliers, combinedMultipliers, computeBenchStats,
} from './weaponBenchStats'

// Real Gmni Pistol Ballistic 01 (= base LH86) recipe.
const SLOTS = [
  { name: 'Frame', resource_name: 'Aluminum', modifiers: [
    { key: 'weapon_recoil_kick', start_quality: 0, end_quality: 1000, modifier_at_start: 1.2, modifier_at_end: 0.8 },
  ] },
  { name: 'Grip', resource_name: 'Hephaestanite', modifiers: [
    { key: 'weapon_recoil_kick', start_quality: 0, end_quality: 1000, modifier_at_start: 1.2, modifier_at_end: 0.8 },
  ] },
  { name: 'Barrel', resource_name: 'Iron', modifiers: [
    { key: 'weapon_damage',   start_quality: 0, end_quality: 1000, modifier_at_start: 0.925, modifier_at_end: 1.075 },
    { key: 'weapon_firerate', start_quality: 0, end_quality: 1000, modifier_at_start: 0.88,  modifier_at_end: 1.12 },
  ] },
]
const BASE = { damage: 13, rounds_per_minute: 950, dps: 205.8 }
const STARK = { fire_rate_multiplier: 0.8, damage_multiplier: null } // -20% fire rate

describe('craftedMultipliers', () => {
  it('stacks recoil across Frame+Grip and applies Barrel to damage/firerate', () => {
    const q = { 0: 750, 1: 600, 2: 820 }
    const m = craftedMultipliers(SLOTS, q)
    // Frame @750: 1.2 + (0.8-1.2)*0.75 = 0.90 ; Grip @600: 1.2 + (-0.4)*0.6 = 0.96 ; product 0.864
    expect(m.get('weapon_recoil_kick')).toBeCloseTo(0.864, 3)
    // Barrel @820 damage: 0.925 + 0.15*0.82 = 1.048
    expect(m.get('weapon_damage')).toBeCloseTo(1.048, 3)
    // Barrel @820 firerate: 0.88 + 0.24*0.82 = 1.0768
    expect(m.get('weapon_firerate')).toBeCloseTo(1.0768, 4)
  })
})

describe('resolveAttachmentMultipliers', () => {
  it('reads fixed columns and treats null/missing as 1.0', () => {
    const r = resolveAttachmentMultipliers(STARK)
    expect(r.weapon_firerate).toBeCloseTo(0.8, 5)
    expect(r.weapon_damage).toBeCloseTo(1.0, 5)
  })
  it('returns empty object for no attachment', () => {
    expect(resolveAttachmentMultipliers(null)).toEqual({})
  })
})

describe('combinedMultipliers + computeBenchStats', () => {
  it('composes crafting × attachments and derives DPS from modified damage×rpm', () => {
    const q = { 0: 750, 1: 600, 2: 820 }
    const combined = combinedMultipliers(SLOTS, q, [STARK])
    const s = computeBenchStats(BASE, combined)
    expect(s.damage).toBeCloseTo(13 * 1.048, 2)               // 13.62
    expect(s.rpm).toBeCloseTo(950 * 1.0768 * 0.8, 1)          // 818.4
    expect(s.dps).toBeCloseTo((13 * 1.048) * (950 * 1.0768 * 0.8) / 60, 1)
    expect(s.recoil).toBeCloseTo(0.864, 3)
  })
})
