import { describe, it, expect } from 'vitest'
import { computeArmourStats } from './armourBenchStats'

const BASE = {
  resist_physical: 0.2, resist_energy: 0.15, resist_distortion: 0.1,
  resist_thermal: 0.05, resist_biochemical: 0, resist_stun: 0,
  temperature_min: -80, temperature_max: 120, weight: 12.5,
}

describe('computeArmourStats', () => {
  it('passes base through with no multipliers', () => {
    expect(computeArmourStats(BASE, {})).toMatchObject(BASE)
  })

  it('armor_damagemitigation scales every resistance, capped at 1', () => {
    const s = computeArmourStats(BASE, { armor_damagemitigation: 1.2 })
    expect(s.resist_physical).toBeCloseTo(0.24, 5)
    expect(s.resist_energy).toBeCloseTo(0.18, 5)
    expect(s.resist_biochemical).toBe(0) // 0 stays 0
    const capped = computeArmourStats({ ...BASE, resist_physical: 0.9 }, { armor_damagemitigation: 1.5 })
    expect(capped.resist_physical).toBe(1)
  })

  it('temperature multipliers widen the survivable band', () => {
    const s = computeArmourStats(BASE, { armor_temperaturemax: 1.1, armor_temperaturemin: 1.25 })
    expect(s.temperature_max).toBeCloseTo(132, 5)
    expect(s.temperature_min).toBeCloseTo(-100, 5) // more negative = colder tolerance
  })

  it('tolerates missing base values', () => {
    const s = computeArmourStats({ resist_physical: 0.1 }, { armor_damagemitigation: 2 })
    expect(s.resist_physical).toBeCloseTo(0.2, 5)
    expect(s.temperature_max).toBeNull()
    expect(s.weight).toBeNull()
  })
})
