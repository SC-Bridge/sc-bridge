import { describe, it, expect } from 'vitest'
import { computeEffectiveRockStats } from './computeEffectiveRockStats'

function ce({ element, min_pct, max_pct, probability = 1.0, ...stats }) {
  return {
    element,
    min_pct,
    max_pct,
    probability,
    stats: {
      element_resistance: stats.element_resistance ?? 0,
      element_instability: stats.element_instability ?? 0,
      element_optimal_window_midpoint: stats.element_optimal_window_midpoint ?? 0,
      element_optimal_window_thinness: stats.element_optimal_window_thinness ?? 0,
      element_explosion_multiplier: stats.element_explosion_multiplier ?? 0,
    },
  }
}

const GLOBAL_SHIP = {
  resistance_curve_factor: 1.0,
  optimal_window_size: 0.1,
  optimal_window_factor: 0.75,
  instability_wave_period: 3.0,
  instability_wave_variance: 1.0,
  instability_curve_factor: 1.0,
}

describe('computeEffectiveRockStats', () => {
  it('returns null when rock entity is missing (Q1 - skip orphans)', () => {
    const result = computeEffectiveRockStats({
      rockEntity: null,
      elements: [ce({ element: 'tin', min_pct: 30, max_pct: 70, element_resistance: -0.2 })],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
    })
    expect(result).toBeNull()
  })

  it('weights elements by midpoint * probability (Q4)', () => {
    // Tin: midpoint=50%, probability=1.0 -> weight=0.50
    // Gold: midpoint=35%, probability=0.2 -> weight=0.07
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: [
        ce({ element: 'tin', min_pct: 30, max_pct: 70, probability: 1.0, element_resistance: -0.2 }),
        ce({ element: 'gold', min_pct: 20, max_pct: 50, probability: 0.2, element_resistance: 1.0 }),
      ],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
    })
    // 2500 * (1 + (-0.2*0.50 + 1.0*0.07)) * 1.0 = 2500 * 0.97 = 2425
    expect(result.effective_resistance).toBeCloseTo(2425, 0)
  })

  it('preserves zero element stats (regression for || bug)', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 1000 },
      elements: [
        ce({ element: 'inert', min_pct: 90, max_pct: 100, element_resistance: 0.0, element_instability: 0.0 }),
      ],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
    })
    expect(result.effective_resistance).toBeCloseTo(1000, 0)
  })

  it('applies laser mod_resistance after global scaling', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: [ce({ element: 'x', min_pct: 100, max_pct: 100, element_resistance: 0 })],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0.08 },
    })
    // 2500 * 1.0 * 1.0 * (1 - 0.08) = 2300
    expect(result.effective_resistance_after_laser).toBeCloseTo(2300, 0)
  })

  it('negative element_resistance lowers the effective resistance', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2000 },
      elements: [ce({ element: 'tin', min_pct: 50, max_pct: 50, probability: 1.0, element_resistance: -0.5 })],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
    })
    expect(result.effective_resistance).toBeLessThan(2000)
    expect(result.effective_resistance).toBeCloseTo(1500, 0)
  })

  it('instability and window come from globals + element deltas (Q3)', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 1000 },
      elements: [ce({ element: 'x', min_pct: 100, max_pct: 100, probability: 1.0,
                       element_instability: 0.3, element_optimal_window_midpoint: 0.1 })],
      globalParams: { ...GLOBAL_SHIP, instability_wave_period: 3.0 },
      laserMods: { mod_resistance: 0 },
    })
    expect(result.effective_instability_delta).toBeCloseTo(0.3, 4)
    expect(result.effective_window_midpoint_delta).toBeCloseTo(0.1, 4)
  })
})
