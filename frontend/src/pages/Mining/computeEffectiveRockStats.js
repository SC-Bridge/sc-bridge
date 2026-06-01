/**
 * Pure math for the Rock Calculator. Implements the game's actual fracture
 * model - see tools/docs/design/2026-06-01-rock-calculator-rewrite.md
 *
 * Element stats are SIGNED MODIFIER DELTAS. `??` is used for numeric
 * defaults so legitimate zeros aren't replaced with neutral fallbacks.
 */
export function computeEffectiveRockStats({
  rockEntity,
  elements,
  globalParams,
  laserMods,
}) {
  if (!rockEntity || rockEntity.laser_damage_full_value == null) return null
  const safe = (v) => (typeof v === 'number' ? v : 0)

  let totalWeight = 0
  const weights = []
  for (const el of elements ?? []) {
    const mid = ((el.min_pct ?? 0) + (el.max_pct ?? 0)) / 2 / 100
    const prob = el.probability ?? 1.0
    const weight = mid * prob
    weights.push({ element: el.element, weight, stats: el.stats ?? {} })
    totalWeight += weight
  }

  let resistanceDelta = 0
  let instabilityDelta = 0
  let windowMidpointDelta = 0
  let windowThinnessDelta = 0
  let explosionDelta = 0
  for (const w of weights) {
    const s = w.stats
    resistanceDelta += safe(s.element_resistance) * w.weight
    instabilityDelta += safe(s.element_instability) * w.weight
    windowMidpointDelta += safe(s.element_optimal_window_midpoint) * w.weight
    windowThinnessDelta += safe(s.element_optimal_window_thinness) * w.weight
    explosionDelta += safe(s.element_explosion_multiplier) * w.weight
  }

  const base = rockEntity.laser_damage_full_value
  const globalResist = globalParams?.resistance_curve_factor ?? 1.0
  const effectiveResistance = base * (1 + resistanceDelta) * globalResist

  const laserResistMod = laserMods?.mod_resistance ?? 0
  const effectiveResistanceAfterLaser = effectiveResistance * (1 - laserResistMod)

  return {
    effective_resistance: effectiveResistance,
    effective_resistance_after_laser: effectiveResistanceAfterLaser,
    effective_instability_delta: instabilityDelta,
    effective_window_midpoint_delta: windowMidpointDelta,
    effective_window_thinness_delta: windowThinnessDelta,
    effective_explosion_delta: explosionDelta,
    weights,
    total_weight: totalWeight,
  }
}
