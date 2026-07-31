import { describe, it, expect } from 'vitest'
import { computeRockResistance, computeDamageFactor } from './computeRockResistance'

// Golden fixture: the generic C-Type asteroid (`asteroid_ctype`) worked
// example in tools/docs/superpowers/specs/
// 2026-07-30-mining-resistance-composition-findings.md §6. min_pct == max_pct
// so the fixture pins the midpoint the doc's table uses regardless of
// qualityRoll.
const el = (element, midPct, probability, resistance) => ({
  element,
  min_pct: midPct,
  max_pct: midPct,
  probability,
  stats: { element_resistance: resistance },
})

const C_TYPE = [
  el('aluminium', 50, 0.85, -0.4),
  el('hephaestanite', 45, 0.6, -0.3),
  el('taranite', 35, 0.3, 0.5),
  el('bexalite', 35, 0.3, 0.6),
  el('gold', 35, 0.07, 0.5),
  el('quantainium', 35, 0.05, 0.95),
]

describe('computeRockResistance', () => {
  it('matches the C-Type asteroid golden (0.24085)', () => {
    expect(computeRockResistance(C_TYPE)).toBeCloseTo(0.24085, 5)
  })

  it('renormalises percentages — scaling every weight leaves the result unchanged', () => {
    // Raw (unnormalised) percentages sum to 235% for asteroid_ctype and the
    // screen blend saturates, giving 0.4909 for every variant. Renormalising
    // makes the blend a composition, so a uniform rescale is a no-op.
    const scaled = C_TYPE.map((e) => ({ ...e, probability: e.probability * 3 }))
    expect(computeRockResistance(scaled)).toBeCloseTo(computeRockResistance(C_TYPE), 10)
  })

  it('is independent of input order (it sorts by resistance DESC internally)', () => {
    const shuffled = [C_TYPE[3], C_TYPE[0], C_TYPE[5], C_TYPE[2], C_TYPE[4], C_TYPE[1]]
    expect(computeRockResistance(shuffled)).toBeCloseTo(computeRockResistance(C_TYPE), 10)
  })

  it('skips parts that cannot roll (probability 0)', () => {
    const withGhost = [...C_TYPE, el('riccite', 40, 0, 0.95)]
    expect(computeRockResistance(withGhost)).toBeCloseTo(computeRockResistance(C_TYPE), 10)
  })

  it('a trace of a hard element contributes sub-linearly, not proportionally', () => {
    // 2% quantainium: pow(0.02, 0.6) * 0.95 = 0.09085, not 0.019.
    const trace = [el('quantainium', 2, 1, 0.95), el('iron', 98, 1, 0)]
    expect(computeRockResistance(trace)).toBeCloseTo(0.09085, 5)
  })

  it('an all-soft rock bottoms out at 0, it does not go negative', () => {
    // Negative contributions scale down what has ALREADY accumulated
    // (d += c * d), so with no hard element to raise d first they are inert.
    const soft = [el('copper', 60, 1, -0.7), el('iron', 40, 1, -0.4)]
    expect(computeRockResistance(soft)).toBe(0)
  })

  it('soft elements pull an accumulated resistance back down', () => {
    const hardOnly = [el('quantainium', 40, 1, 0.95), el('inert', 60, 1, 0)]
    const withSoft = [el('quantainium', 40, 1, 0.95), el('copper', 60, 1, -0.7)]
    expect(computeRockResistance(withSoft)).toBeLessThan(computeRockResistance(hardOnly))
    expect(computeRockResistance(withSoft)).toBeGreaterThan(0)
  })

  it('returns 0 for an empty or weightless composition', () => {
    expect(computeRockResistance([])).toBe(0)
    expect(computeRockResistance(undefined)).toBe(0)
    expect(computeRockResistance([el('x', 0, 1, 0.5)])).toBe(0)
  })

  it('samples the quality roll between min_pct and max_pct', () => {
    // A rich roll of a high-resistance element is a harder rock.
    const rock = [
      { element: 'quantainium', min_pct: 10, max_pct: 40, probability: 1, stats: { element_resistance: 0.95 } },
      { element: 'iron', min_pct: 60, max_pct: 60, probability: 1, stats: { element_resistance: -0.4 } },
    ]
    expect(computeRockResistance(rock, 1)).toBeGreaterThan(computeRockResistance(rock, 0))
    expect(computeRockResistance(rock, 5)).toBeCloseTo(computeRockResistance(rock, 1), 10)
    expect(computeRockResistance(rock, -3)).toBeCloseTo(computeRockResistance(rock, 0), 10)
  })
})

describe('computeDamageFactor', () => {
  const ROCK = 0.24084843995748423 // the C-Type golden

  it('bare loadout: damageFactor = 1 - rockResistance', () => {
    expect(computeDamageFactor(ROCK, 0)).toBeCloseTo(0.7592, 4)
  })

  it('a positive modifier (Arbor +25%) hardens the rock', () => {
    expect(computeDamageFactor(ROCK, 0.25)).toBeCloseTo(0.6989, 4)
  })

  it('a negative modifier (Klein -45%) softens the rock', () => {
    expect(computeDamageFactor(ROCK, -0.3)).toBeCloseTo(0.8314, 4)
    expect(computeDamageFactor(ROCK, -0.45)).toBeCloseTo(0.8675, 4)
  })

  it('clamps effective resistance at 0 — a soft rock never gives a damage bonus', () => {
    expect(computeDamageFactor(-0.5, 0)).toBe(1)
    expect(computeDamageFactor(0.2, -3)).toBe(1)
  })

  it('clamps effective resistance at 0.95 — damage never reaches zero', () => {
    expect(computeDamageFactor(0.95, 2)).toBeCloseTo(0.05, 10)
  })

  it('defaults a missing modifier to none', () => {
    expect(computeDamageFactor(ROCK)).toBeCloseTo(1 - ROCK, 10)
  })
})
