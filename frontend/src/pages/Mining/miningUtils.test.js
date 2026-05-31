import { describe, it, expect } from 'vitest'
import { computeRockStats } from './miningUtils'

// Helper: stub a composition element row matching the API shape (snake_case
// straight from rock_compositions.composition_json) plus the `stats` join
// that RockCalculator computes by matching against mineable_elements.
function el({ element, min_pct, max_pct, resistance, instability, mid = 0.5, thin = 0.5 }) {
  return {
    element,
    min_pct,
    max_pct,
    probability: 1.0,
    quality_scale: 1.0,
    stats: {
      resistance,
      instability,
      optimal_window_midpoint: mid,
      optimal_window_thinness: thin,
    },
  }
}

describe('computeRockStats', () => {
  it('returns neutral defaults for empty input', () => {
    expect(computeRockStats([])).toEqual({
      resistance: 0,
      instability: 0.5,
      optimal_window_midpoint: 0.5,
      optimal_window_thinness: 0.5,
    })
    expect(computeRockStats(null)).toMatchObject({ resistance: 0, instability: 0.5 })
    expect(computeRockStats(undefined)).toMatchObject({ resistance: 0, instability: 0.5 })
  })

  it('weights elements by max_pct (snake_case) — regression test for the bug', () => {
    // Two elements, one with high abundance + low resistance, one with low
    // abundance + high resistance. If weighting is broken (the bug — both
    // get weight 1), the average resistance is (10 + 90) / 2 = 50.
    // With correct max_pct weighting (70 vs 10), the answer is:
    //   (10 * 70 + 90 * 10) / (70 + 10) = (700 + 900) / 80 = 20
    const rocks = [
      el({ element: 'aluminium_ore',  min_pct: 30, max_pct: 70, resistance: 10, instability: 0.2 }),
      el({ element: 'quantainium_raw', min_pct: 5,  max_pct: 10, resistance: 90, instability: 0.9 }),
    ]
    const stats = computeRockStats(rocks)
    expect(stats.resistance).toBeCloseTo(20, 5)
    // Sanity — not equal to the broken-equal-weight answer of 50.
    expect(stats.resistance).not.toBeCloseTo(50, 1)
  })

  it('weighted-average instability uses max_pct correctly', () => {
    const rocks = [
      el({ element: 'a', max_pct: 60, resistance: 0, instability: 0.0 }),
      el({ element: 'b', max_pct: 40, resistance: 0, instability: 1.0 }),
    ]
    const stats = computeRockStats(rocks)
    // (0.0 * 60 + 1.0 * 40) / 100 = 0.40
    expect(stats.instability).toBeCloseTo(0.4, 5)
  })

  it('falls back to min_pct when max_pct is missing, then to 1', () => {
    // Element 1: only min_pct → weight 50
    // Element 2: neither set → weight 1
    const rocks = [
      { element: 'a', min_pct: 50, stats: { resistance: 10, instability: 0.5, optimal_window_midpoint: 0.5, optimal_window_thinness: 0.5 } },
      { element: 'b', stats: { resistance: 90, instability: 0.5, optimal_window_midpoint: 0.5, optimal_window_thinness: 0.5 } },
    ]
    const stats = computeRockStats(rocks)
    // (10 * 50 + 90 * 1) / 51 = 590 / 51 ≈ 11.57
    expect(stats.resistance).toBeCloseTo(590 / 51, 5)
  })

  it('treats missing stats as the neutral resistance/instability defaults', () => {
    const rocks = [
      el({ element: 'a', max_pct: 50, resistance: 100, instability: 0.0 }),
      { element: 'b', max_pct: 50 }, // no stats join (orphan composition element)
    ]
    const stats = computeRockStats(rocks)
    // Element b contributes resistance=0, instability=0.5 (defaults)
    // (100*50 + 0*50) / 100 = 50
    // (0.0*50 + 0.5*50) / 100 = 0.25
    expect(stats.resistance).toBeCloseTo(50, 5)
    expect(stats.instability).toBeCloseTo(0.25, 5)
  })

  it('window midpoint and thinness propagate through the weighted average', () => {
    const rocks = [
      el({ element: 'a', max_pct: 50, resistance: 0, instability: 0.5, mid: 0.2, thin: 0.3 }),
      el({ element: 'b', max_pct: 50, resistance: 0, instability: 0.5, mid: 0.8, thin: 0.7 }),
    ]
    const stats = computeRockStats(rocks)
    expect(stats.optimal_window_midpoint).toBeCloseTo(0.5, 5)
    expect(stats.optimal_window_thinness).toBeCloseTo(0.5, 5)
  })
})
