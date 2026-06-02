/**
 * Pure math for the Rock Calculator. Implements the game's actual fracture
 * model - see tools/docs/design/2026-06-01-rock-calculator-rewrite.md
 *
 * Element stats are SIGNED MODIFIER DELTAS. `??` is used for numeric
 * defaults so legitimate zeros aren't replaced with neutral fallbacks.
 *
 * `qualityRoll` (0..1) picks where in each element's [min_pct, max_pct] range
 * the instance rolled — this is the in-game "quality" axis. 0 = lean roll
 * (every element at its minimum %), 1 = rich roll (every element at max %),
 * 0.5 = midpoint (the default; preserves the original per-rock estimate).
 * Proven from p4k: difficulty and quality co-ride this roll — richer rolls of
 * valuable elements carry higher resistance and (especially) instability.
 * See reference_sc_mining_quality_difficulty_mechanism.
 */
export function computeEffectiveRockStats({
  rockEntity,
  elements,
  globalParams,
  laserMods,
  qualityRoll = 0.5,
}) {
  if (!rockEntity || rockEntity.laser_damage_full_value == null) return null
  const safe = (v) => (typeof v === 'number' ? v : 0)
  const q = Math.min(1, Math.max(0, qualityRoll ?? 0.5))

  let totalWeight = 0
  const weights = []
  for (const el of elements ?? []) {
    const lo = el.min_pct ?? 0
    const hi = el.max_pct ?? 0
    // lerp(lo, hi, q): q=0 → lean (min%), q=1 → rich (max%), q=0.5 → midpoint
    const pct = (lo + (hi - lo) * q) / 100
    const prob = el.probability ?? 1.0
    const weight = pct * prob
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

/**
 * Sample the quality band for a single rock: lean (qualityRoll=0), avg (0.5),
 * rich (1.0). Returns { lean, avg, rich } where each is a full
 * computeEffectiveRockStats result, or null if the rock can't be resolved.
 *
 * The avg point is the expected rock (drives can-break / charge math); lean
 * and rich bracket the difficulty envelope a player will actually encounter
 * across quality rolls of this composition.
 */
export function computeQualityBand(args) {
  const avg = computeEffectiveRockStats({ ...args, qualityRoll: 0.5 })
  if (!avg) return null
  return {
    lean: computeEffectiveRockStats({ ...args, qualityRoll: 0 }),
    avg,
    rich: computeEffectiveRockStats({ ...args, qualityRoll: 1 }),
  }
}
