// Rock resistance from element composition, and the 0–1 damage factor it
// implies. See tools/docs/superpowers/specs/
// 2026-07-30-mining-resistance-composition-findings.md.
//
// A rock carries no resistance field of its own — difficulty is composed
// entirely from its element list's `elementResistance` values (-1…+1). The
// blend is NOT a weighted average: it is a sequential screen (probabilistic
// OR) over elements sorted hardest-first, so a trace of quantainium raises
// resistance a lot while soft elements scale back down what has accumulated.

// Composition fraction exponent for the resistance blend. Literal 0.6 matches
// the scmdb reference solver. Ship scope's mining_global_params
// .resistance_curve_factor is also 0.6, so the two are numerically identical
// for the only scope RockCalculator uses; fps/ground_vehicle are 0.33, and
// whether that column IS this exponent is unproven — verify before switching
// to it if the real equipment scope is ever threaded through.
const RESISTANCE_COMPOSITION_EXPONENT = 0.6

// Effective resistance can never reach 1.0 (that would zero the damage factor
// outright). 0.95 is also exactly the elementResistance of the hardest real
// ores — quantainium, riccite, savrilium, lindinium.
const MAX_EFFECTIVE_RESISTANCE = 0.95

/**
 * Rock resistance as a signed fraction in (-1, 1).
 *
 * `qualityRoll` (0..1) picks where in each element's [min_pct, max_pct] range
 * the instance rolled, the same axis computeEffectiveRockStats samples.
 */
export function computeRockResistance(elements, qualityRoll = 0.5) {
  const q = Math.min(1, Math.max(0, qualityRoll ?? 0.5))
  const parts = []
  for (const el of elements ?? []) {
    const prob = el.probability ?? 1.0
    if (!(prob > 0)) continue
    const lo = el.min_pct ?? 0
    const hi = el.max_pct ?? 0
    parts.push({
      w: ((lo + (hi - lo) * q) / 100) * prob,
      r: el.stats?.element_resistance ?? 0,
    })
  }
  const total = parts.reduce((s, p) => s + p.w, 0)
  if (!(total > 0)) return 0

  parts.sort((a, b) => b.r - a.r) // hardest element first
  let d = 0
  for (const p of parts) {
    // Renormalise to a real composition (fractions summing to 1). Without
    // this the raw percentages sum well past 100%, the blend saturates, and
    // every variant of a rock type collapses to the same resistance.
    const frac = p.w / total
    const c = Math.max(-1, Math.min(1,
      Math.pow(frac, RESISTANCE_COMPOSITION_EXPONENT) * p.r))
    d += c > 0 ? c * (1 - d) : c * d
  }
  return d
}

/**
 * 0–1 damage factor: multiply base DPS by this to get effective DPS.
 *
 * `modResistance` is the stacked laser/module/gadget resistance modifier as a
 * fraction (-0.45 = Klein S1's -45%), applied multiplicatively as (1 + mod).
 */
export function computeDamageFactor(rockResistance, modResistance = 0) {
  const effective = (rockResistance ?? 0) * (1 + (modResistance ?? 0))
  return 1 - Math.max(0, Math.min(MAX_EFFECTIVE_RESISTANCE, effective))
}
