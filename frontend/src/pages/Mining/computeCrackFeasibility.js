// Crack feasibility from the validated mass model (see tools
// docs/superpowers/specs/2026-07-30-rock-mass-cracking-findings.md —
// DataCore constants cross-validated against the scmdb community solver).
// capacity = powerCapacityPerMass × mass: the energy pool a laser must fill.
// decay    = decayPerMass × mass: how fast the pool drains while charging.
// A laser can crack the rock iff its resistance-adjusted DPS beats the
// drain; best-case time assumes full throttle the whole way.
export function computeCrackFeasibility({ mass, globalParams, effectiveDPS }) {
  const cap = globalParams?.power_capacity_per_mass
  const dec = globalParams?.decay_per_mass
  if (typeof mass !== 'number' || !(mass > 0) || cap == null || dec == null) return null
  const capacity = cap * mass
  const decay = dec * mass
  const dps = typeof effectiveDPS === 'number' ? effectiveDPS : 0
  const netRate = dps - decay
  const canCrack = netRate > 0
  return {
    capacity,
    decay,
    netRate,
    canCrack,
    timeToCrack: canCrack ? capacity / netRate : null,
    marginPct: decay > 0 ? (netRate / decay) * 100 : 0,
  }
}
