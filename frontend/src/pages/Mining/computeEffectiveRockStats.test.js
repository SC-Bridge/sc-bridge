import { describe, it, expect } from 'vitest'
import { computeEffectiveRockStats, computeQualityBand } from './computeEffectiveRockStats'

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

  // Resistance modifiers are CIG FloatModifierMultiplicative values stored by
  // the extractor as raw/100 with no sign flip, so they apply as × (1 + mod):
  // a POSITIVE mod_resistance makes the rock harder. See
  // tools/docs/superpowers/specs/2026-07-30-mining-resistance-composition-findings.md
  // §7.1 — the previous (1 - mod) reading ranked every mining laser backwards
  // (Arbor +25 read as the best laser, Klein -45 as the worst).
  it('applies laser mod_resistance after global scaling — positive mod hardens the rock', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: [ce({ element: 'x', min_pct: 100, max_pct: 100, element_resistance: 0 })],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0.08 },
    })
    // 2500 * 1.0 * 1.0 * (1 + 0.08) = 2700
    expect(result.effective_resistance_after_laser).toBeCloseTo(2700, 0)
  })

  it('a resistance-reducing laser (Klein -45%) softens the rock', () => {
    const args = {
      rockEntity: { laser_damage_full_value: 2500 },
      elements: [ce({ element: 'x', min_pct: 100, max_pct: 100, element_resistance: 0 })],
      globalParams: GLOBAL_SHIP,
    }
    const bare = computeEffectiveRockStats({ ...args, laserMods: { mod_resistance: 0 } })
    const klein = computeEffectiveRockStats({ ...args, laserMods: { mod_resistance: -0.45 } })
    expect(klein.effective_resistance_after_laser).toBeLessThan(bare.effective_resistance_after_laser)
    // 2500 * (1 - 0.45) = 1375
    expect(klein.effective_resistance_after_laser).toBeCloseTo(1375, 0)
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

  // rock_resistance rides the same quality roll as the other stats so the
  // crack verdict and the results panel read the same expected rock. The
  // value itself is computeRockResistance's contract (own suite); this
  // asserts it is exposed and quality-sampled here.
  it('exposes the composed rock_resistance (C-Type golden 0.24085)', () => {
    const result = computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 2500 },
      elements: [
        ce({ element: 'aluminium', min_pct: 50, max_pct: 50, probability: 0.85, element_resistance: -0.4 }),
        ce({ element: 'hephaestanite', min_pct: 45, max_pct: 45, probability: 0.6, element_resistance: -0.3 }),
        ce({ element: 'taranite', min_pct: 35, max_pct: 35, probability: 0.3, element_resistance: 0.5 }),
        ce({ element: 'bexalite', min_pct: 35, max_pct: 35, probability: 0.3, element_resistance: 0.6 }),
        ce({ element: 'gold', min_pct: 35, max_pct: 35, probability: 0.07, element_resistance: 0.5 }),
        ce({ element: 'quantainium', min_pct: 35, max_pct: 35, probability: 0.05, element_resistance: 0.95 }),
      ],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
    })
    expect(result.rock_resistance).toBeCloseTo(0.24085, 5)
  })

  it('rock_resistance follows the quality roll', () => {
    const rock = (qualityRoll) => computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 1000 },
      elements: [
        ce({ element: 'quantainium', min_pct: 10, max_pct: 40, probability: 1, element_resistance: 0.95 }),
        ce({ element: 'iron', min_pct: 60, max_pct: 60, probability: 1, element_resistance: -0.4 }),
      ],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
      qualityRoll,
    })
    expect(rock(1).rock_resistance).toBeGreaterThan(rock(0).rock_resistance)
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

  describe('qualityRoll (quality band)', () => {
    // tin: instability 50, resistance 0.2, 20-60% range
    const tinRock = (qualityRoll) => computeEffectiveRockStats({
      rockEntity: { laser_damage_full_value: 1000 },
      elements: [ce({ element: 'tin', min_pct: 20, max_pct: 60, probability: 1.0,
                       element_resistance: 0.2, element_instability: 50 })],
      globalParams: GLOBAL_SHIP,
      laserMods: { mod_resistance: 0 },
      qualityRoll,
    })

    it('qualityRoll=0 uses min_pct (lean roll)', () => {
      // weight = 0.20 * 1.0 = 0.20 → resistance = 1000 * (1 + 0.2*0.20) = 1040
      expect(tinRock(0).effective_resistance).toBeCloseTo(1040, 0)
      // instability = 50 * 0.20 = 10
      expect(tinRock(0).effective_instability_delta).toBeCloseTo(10, 4)
    })

    it('qualityRoll=1 uses max_pct (rich roll)', () => {
      // weight = 0.60 * 1.0 = 0.60 → resistance = 1000 * (1 + 0.2*0.60) = 1120
      expect(tinRock(1).effective_resistance).toBeCloseTo(1120, 0)
      // instability = 50 * 0.60 = 30
      expect(tinRock(1).effective_instability_delta).toBeCloseTo(30, 4)
    })

    it('default (omitted) qualityRoll equals 0.5 midpoint', () => {
      const omitted = computeEffectiveRockStats({
        rockEntity: { laser_damage_full_value: 1000 },
        elements: [ce({ element: 'tin', min_pct: 20, max_pct: 60, probability: 1.0,
                         element_resistance: 0.2, element_instability: 50 })],
        globalParams: GLOBAL_SHIP,
        laserMods: { mod_resistance: 0 },
      })
      expect(omitted.effective_resistance).toBeCloseTo(tinRock(0.5).effective_resistance, 6)
      expect(omitted.effective_instability_delta).toBeCloseTo(tinRock(0.5).effective_instability_delta, 6)
    })

    it('rich roll raises instability above lean roll (the quality→difficulty signal)', () => {
      expect(tinRock(1).effective_instability_delta).toBeGreaterThan(tinRock(0).effective_instability_delta)
    })

    it('clamps qualityRoll outside [0,1]', () => {
      expect(tinRock(5).effective_instability_delta).toBeCloseTo(tinRock(1).effective_instability_delta, 6)
      expect(tinRock(-3).effective_instability_delta).toBeCloseTo(tinRock(0).effective_instability_delta, 6)
    })
  })
})

describe('computeQualityBand', () => {
  const args = {
    rockEntity: { laser_damage_full_value: 2000 },
    elements: [{
      element: 'quant', min_pct: 20, max_pct: 50, probability: 1.0,
      stats: { element_resistance: 0.95, element_instability: 1000,
               element_optimal_window_midpoint: 0, element_optimal_window_thinness: 0,
               element_explosion_multiplier: 0 },
    }],
    globalParams: { resistance_curve_factor: 1.0 },
    laserMods: { mod_resistance: 0 },
  }

  it('returns lean / avg / rich sampled at qualityRoll 0 / 0.5 / 1', () => {
    const band = computeQualityBand(args)
    expect(band).not.toBeNull()
    // rich instability (50% quant) > avg (35%) > lean (20%) — strictly increasing
    expect(band.rich.effective_instability_delta).toBeGreaterThan(band.avg.effective_instability_delta)
    expect(band.avg.effective_instability_delta).toBeGreaterThan(band.lean.effective_instability_delta)
    // resistance climbs too for this high-resistance element
    expect(band.rich.effective_resistance).toBeGreaterThan(band.lean.effective_resistance)
  })

  it('returns null when the rock cannot be resolved', () => {
    expect(computeQualityBand({ ...args, rockEntity: null })).toBeNull()
  })
})
