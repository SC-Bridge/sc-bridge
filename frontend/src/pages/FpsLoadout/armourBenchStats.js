// Pure armour stat engine (#200 slice 2). Crafting quality expresses itself
// through three recipe modifier keys (same STAT_INFO family the Quality Sim
// uses): armor_damagemitigation scales every resistance (capped at 1.0 = full
// absorb), armor_temperaturemax/min scale the survivable temperature band
// (temperature_min is typically negative — a >1 multiplier makes it MORE
// negative, i.e. better cold tolerance).
const RESIST_KEYS = [
  'resist_physical', 'resist_energy', 'resist_distortion',
  'resist_thermal', 'resist_biochemical', 'resist_stun',
]

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

export function computeArmourStats(baseStats, multipliers = {}) {
  const base = baseStats || {}
  const mit = multipliers.armor_damagemitigation ?? 1
  const out = {}
  for (const k of RESIST_KEYS) {
    const b = num(base[k])
    out[k] = b == null ? null : Math.min(1, b * mit)
  }
  const tmax = num(base.temperature_max)
  const tmin = num(base.temperature_min)
  out.temperature_max = tmax == null ? null : tmax * (multipliers.armor_temperaturemax ?? 1)
  out.temperature_min = tmin == null ? null : tmin * (multipliers.armor_temperaturemin ?? 1)
  out.weight = num(base.weight)
  return out
}
