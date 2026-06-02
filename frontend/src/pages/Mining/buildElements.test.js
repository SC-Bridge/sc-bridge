import { describe, it, expect } from 'vitest'
import { elementStats, buildElements } from './RockCalculator'
import { computeEffectiveRockStats } from './computeEffectiveRockStats'

/**
 * Regression guard for the field-name mismatch that left element math inert in
 * production: mineable_elements rows from /api/gamedata/mining carry UNPREFIXED
 * columns (resistance, instability, …), but computeEffectiveRockStats reads
 * element_-prefixed keys. buildElements must bridge them.
 */
describe('elementStats — maps unprefixed DB columns to element_-prefixed keys', () => {
  it('maps every consumed stat', () => {
    const row = {
      class_name: 'iron_ore',
      resistance: -0.4,
      instability: 50,
      optimal_window_midpoint: 0.6,
      optimal_window_thinness: -0.9,
      explosion_multiplier: 20,
    }
    expect(elementStats(row)).toEqual({
      element_resistance: -0.4,
      element_instability: 50,
      element_optimal_window_midpoint: 0.6,
      element_optimal_window_thinness: -0.9,
      element_explosion_multiplier: 20,
    })
  })

  it('returns {} for an unmatched element', () => {
    expect(elementStats(undefined)).toEqual({})
    expect(elementStats(null)).toEqual({})
  })
})

describe('buildElements → computeEffectiveRockStats integration', () => {
  // The real-DB shape: composition_json elements joined to unprefixed
  // mineable_elements rows. This is the path that was silently producing
  // zero deltas in production.
  const compositions = [{
    uuid: 'c-iron',
    composition_json: JSON.stringify([
      { element: 'iron_ore', min_pct: 9.7, max_pct: 15.7, probability: 1.0 },
      { element: 'iron_ore', min_pct: 34.3, max_pct: 84.3, probability: 1.0 },
    ]),
  }]
  const elements = [
    { class_name: 'iron_ore', resistance: -0.4, instability: 50,
      optimal_window_midpoint: 0.6, optimal_window_thinness: -0.9, explosion_multiplier: 20 },
  ]

  it('produces NON-ZERO instability from real-shaped element rows', () => {
    const built = buildElements('c-iron', compositions, elements)
    expect(built).toHaveLength(2)
    // stats must carry the prefixed keys, not be empty
    expect(built[0].stats.element_instability).toBe(50)

    const stats = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: built,
      globalParams: { resistance_curve_factor: 0.6 },
      laserMods: { mod_resistance: 0 },
    })
    // iron instability 50 × summed weights (~0.72 at midpoint) ≈ 36, definitely not 0
    expect(stats.effective_instability_delta).toBeGreaterThan(0)
    // resistance delta is negative for iron (-0.4) → effective below base×global
    expect(stats.effective_resistance).toBeLessThan(2500 * 0.6)
  })

  it('distinguishes a high-resistance element from a low one (quantainium vs iron)', () => {
    const comps = [
      { uuid: 'iron', composition_json: JSON.stringify([{ element: 'iron_ore', min_pct: 50, max_pct: 50, probability: 1 }]) },
      { uuid: 'quant', composition_json: JSON.stringify([{ element: 'quantainium_raw', min_pct: 50, max_pct: 50, probability: 1 }]) },
    ]
    const els = [
      { class_name: 'iron_ore', resistance: -0.4, instability: 50 },
      { class_name: 'quantainium_raw', resistance: 0.95, instability: 1000 },
    ]
    const mk = (uuid) => computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: buildElements(uuid, comps, els),
      globalParams: { resistance_curve_factor: 0.6 },
      laserMods: { mod_resistance: 0 },
    })
    const iron = mk('iron')
    const quant = mk('quant')
    // quantainium must be harder + far more unstable than iron — the whole point
    expect(quant.effective_resistance).toBeGreaterThan(iron.effective_resistance)
    expect(quant.effective_instability_delta).toBeGreaterThan(iron.effective_instability_delta)
  })
})
