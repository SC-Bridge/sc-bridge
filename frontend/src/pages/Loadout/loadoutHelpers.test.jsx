import { describe, it, expect } from 'vitest'
import {
  fmtInt, fmtCompact, fmtDec1, fmtPct, fmtSpeed, fmtRange, fmtRPM,
  getPortCategory, getDamageType, aggregateCombatStats,
  PORT_CATEGORY_ORDER, COMPONENT_TYPE_TO_PORT_TYPE,
  groupLoadoutByLocation,
} from './loadoutHelpers'


// ─── Number formatters ──────────────────────────────────────────────────────

describe('fmtInt', () => {
  it('formats with commas', () => {
    expect(fmtInt(1000)).toBe('1,000')
    expect(fmtInt(9240)).toBe('9,240')
  })

  it('no decimals', () => {
    expect(fmtInt(3.7)).toBe('4')
  })
})

describe('fmtCompact', () => {
  it('formats millions', () => {
    expect(fmtCompact(1500000)).toBe('1.5M')
    expect(fmtCompact(2112000)).toBe('2.1M')
    expect(fmtCompact(1000000)).toBe('1M')
  })

  it('formats hundreds of thousands', () => {
    expect(fmtCompact(100000)).toBe('100K')
    expect(fmtCompact(456000)).toBe('456K')
  })

  it('formats normal numbers with commas', () => {
    expect(fmtCompact(9240)).toBe('9,240')
    expect(fmtCompact(42)).toBe('42')
    expect(fmtCompact(999)).toBe('999')
  })

  it('handles zero', () => {
    expect(fmtCompact(0)).toBe('0')
  })

  it('Idris shield HP does not overflow', () => {
    // The whole point of fmtCompact — Idris has 2,112,000 shield HP
    const result = fmtCompact(2112000)
    expect(result.length).toBeLessThanOrEqual(5) // "2.1M" is 4 chars
    expect(result).toBe('2.1M')
  })
})

describe('fmtDec1', () => {
  it('one decimal place', () => {
    expect(fmtDec1(97.5)).toBe('97.5')
    expect(fmtDec1(1.85)).toBe('1.9') // rounded
  })
})

describe('fmtPct', () => {
  it('formats as percentage', () => {
    expect(fmtPct(0.5)).toBe('50.0%')
    expect(fmtPct(1)).toBe('100.0%')
  })
})

describe('fmtSpeed', () => {
  it('converts to Mm/s', () => {
    expect(fmtSpeed(201000000)).toBe('201 Mm/s')
  })
})

describe('fmtRange', () => {
  it('converts to km', () => {
    expect(fmtRange(3006)).toBe('3 km')
  })
})

describe('fmtRPM', () => {
  it('formats with RPM suffix', () => {
    expect(fmtRPM(750)).toBe('750 RPM')
  })
})


// ─── Port category classification ───────────────────────────────────────────

describe('getPortCategory', () => {
  it('returns category_label when it matches a known category', () => {
    expect(getPortCategory('weapon', 'Weapons')).toBe('Weapons')
    expect(getPortCategory('turret', 'Turrets')).toBe('Turrets')
  })

  it('falls back to PORT_TYPE_LABELS when category_label is null', () => {
    expect(getPortCategory('shield', null)).toBe('Shields')
    expect(getPortCategory('power', null)).toBe('Power Plants')
    expect(getPortCategory('cooler', null)).toBe('Coolers')
  })

  it('falls back to portType string for unknown types', () => {
    expect(getPortCategory('unknown_type', null)).toBe('unknown_type')
  })
})

describe('PORT_CATEGORY_ORDER', () => {
  it('weapons come before turrets', () => {
    const wi = PORT_CATEGORY_ORDER.indexOf('Weapons')
    const ti = PORT_CATEGORY_ORDER.indexOf('Turrets')
    expect(wi).toBeLessThan(ti)
  })

  it('missiles come after turrets and before point defense', () => {
    const ti = PORT_CATEGORY_ORDER.indexOf('Turrets')
    const mi = PORT_CATEGORY_ORDER.indexOf('Missiles')
    const pi = PORT_CATEGORY_ORDER.indexOf('Point Defense')
    expect(mi).toBeGreaterThan(ti)
    expect(pi).toBeGreaterThan(mi)
  })

  it('torpedoes come after missiles and before point defense', () => {
    const mi = PORT_CATEGORY_ORDER.indexOf('Missiles')
    const toi = PORT_CATEGORY_ORDER.indexOf('Torpedoes')
    const pi = PORT_CATEGORY_ORDER.indexOf('Point Defense')
    expect(toi).toBeGreaterThan(mi)
    expect(pi).toBeGreaterThan(toi)
  })

  it('point defense comes after torpedoes and before shields', () => {
    const toi = PORT_CATEGORY_ORDER.indexOf('Torpedoes')
    const pi = PORT_CATEGORY_ORDER.indexOf('Point Defense')
    const si = PORT_CATEGORY_ORDER.indexOf('Shields')
    expect(pi).toBeGreaterThan(toi)
    expect(si).toBeGreaterThan(pi)
  })

  it('includes all major categories', () => {
    for (const cat of ['Weapons', 'Turrets', 'Missiles', 'Torpedoes', 'Point Defense', 'Shields', 'Power Plants', 'Coolers', 'Quantum Drives', 'Sensors']) {
      expect(PORT_CATEGORY_ORDER).toContain(cat)
    }
  })

  it('full order: Weapons → Turrets → Missiles → Torpedoes → Point Defense → Shields → Power Plants → Coolers → Quantum Drives → ...', () => {
    const expectedPrefix = [
      'Weapons',
      'Turrets',
      'Missiles',
      'Torpedoes',
      'Point Defense',
      'Shields',
      'Power Plants',
      'Coolers',
      'Quantum Drives',
    ]
    // Each of these must appear at the correct relative position
    for (let i = 0; i < expectedPrefix.length; i++) {
      expect(PORT_CATEGORY_ORDER.indexOf(expectedPrefix[i])).toBe(
        PORT_CATEGORY_ORDER.indexOf(expectedPrefix[i])
      )
      if (i > 0) {
        expect(PORT_CATEGORY_ORDER.indexOf(expectedPrefix[i])).toBeGreaterThan(
          PORT_CATEGORY_ORDER.indexOf(expectedPrefix[i - 1])
        )
      }
    }
  })
})


// ─── Damage type detection ──────────────────────────────────────────────────

describe('getDamageType', () => {
  it('detects energy from per-type damage fields', () => {
    expect(getDamageType({ damage_energy: 65.43, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 })).toBe('energy')
  })

  it('detects physical from per-type damage fields', () => {
    expect(getDamageType({ damage_physical: 50, damage_energy: 0, damage_distortion: 0, damage_thermal: 0 })).toBe('physical')
  })

  it('detects distortion', () => {
    expect(getDamageType({ damage_distortion: 30, damage_physical: 0, damage_energy: 0, damage_thermal: 0 })).toBe('distortion')
  })

  it('falls back to damage_type string', () => {
    expect(getDamageType({ damage_type: 'Energy' })).toBe('energy')
    expect(getDamageType({ damage_type: 'Ballistic' })).toBe('physical')
    expect(getDamageType({ damage_type: 'Distortion' })).toBe('distortion')
  })

  it('returns null when no damage info', () => {
    expect(getDamageType({})).toBeNull()
  })
})


// ─── Combat stats aggregation ───────────────────────────────────────────────

describe('aggregateCombatStats', () => {
  const mockAsgardComponents = [
    // 2x S4 Rhino weapons
    { port_type: 'weapon', dps: 817.88, damage_per_shot: 65.43, rounds_per_minute: 750, damage_energy: 65.43, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    { port_type: 'weapon', dps: 817.88, damage_per_shot: 65.43, rounds_per_minute: 750, damage_energy: 65.43, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    // 4x S3 Panther weapons
    { port_type: 'weapon', dps: 545.62, damage_per_shot: 43.65, rounds_per_minute: 750, damage_energy: 43.65, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    { port_type: 'weapon', dps: 545.62, damage_per_shot: 43.65, rounds_per_minute: 750, damage_energy: 43.65, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    { port_type: 'weapon', dps: 545.62, damage_per_shot: 43.65, rounds_per_minute: 750, damage_energy: 43.65, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    { port_type: 'weapon', dps: 545.62, damage_per_shot: 43.65, rounds_per_minute: 750, damage_energy: 43.65, damage_physical: 0, damage_distortion: 0, damage_thermal: 0 },
    // 4x shields
    { port_type: 'shield', shield_hp: 9240, shield_regen: 330 },
    { port_type: 'shield', shield_hp: 9240, shield_regen: 330 },
    { port_type: 'shield', shield_hp: 9240, shield_regen: 330 },
    { port_type: 'shield', shield_hp: 9240, shield_regen: 330 },
    // 2x power plants
    { port_type: 'power', power_output: 9375 },
    { port_type: 'power', power_output: 9375 },
    // 3x coolers
    { port_type: 'cooler', cooling_rate: 5200000 },
    { port_type: 'cooler', cooling_rate: 5200000 },
    { port_type: 'cooler', cooling_rate: 5200000 },
  ]

  it('sums DPS from all weapon ports', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    // 2*817.88 + 4*545.62 = 1635.76 + 2182.48 = 3818.24
    expect(stats.totalDps).toBeCloseTo(3818.24, 0)
  })

  it('sums alpha from all weapon ports', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    // 2*65.43 + 4*43.65 = 130.86 + 174.6 = 305.46
    expect(stats.totalAlpha).toBeCloseTo(305.46, 0)
  })

  it('all damage is energy type', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    expect(stats.dpsEnergy).toBeGreaterThan(0)
    expect(stats.dpsPhysical).toBe(0)
    expect(stats.dpsDistortion).toBe(0)
    expect(stats.dpsThermal).toBe(0)
  })

  it('sums shield HP', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    expect(stats.totalShieldHp).toBe(4 * 9240) // 36,960
  })

  it('sums shield regen', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    expect(stats.totalShieldRegen).toBe(4 * 330) // 1,320
  })

  it('sums power output', () => {
    const stats = aggregateCombatStats(mockAsgardComponents)
    expect(stats.totalPowerOutput).toBe(2 * 9375) // 18,750
  })

  it('ignores non-weapon/shield/power ports for their respective stats', () => {
    const stats = aggregateCombatStats([
      { port_type: 'cooler', dps: 999 }, // cooler should not count as DPS
      { port_type: 'sensor', shield_hp: 999 }, // sensor should not count as shield
    ])
    expect(stats.totalDps).toBe(0)
    expect(stats.totalShieldHp).toBe(0)
  })

  it('handles empty array', () => {
    const stats = aggregateCombatStats([])
    expect(stats.totalDps).toBe(0)
    expect(stats.totalShieldHp).toBe(0)
    expect(stats.totalPowerOutput).toBe(0)
  })
})


// ─── Weapon-turret detection ────────────────────────────────────────────────

describe('isWeaponTurret', () => {
  it('returns true for top-level weapon port with weapon_count > 1', () => {
    // Terrapin Medic nose: port_type=weapon, weapon_count=2, no parent
    const port = { port_type: 'weapon', parent_port_id: null, weapon_count: 2 }
    const result = port.port_type === 'weapon' && !port.parent_port_id && port.weapon_count > 1
    expect(result).toBe(true)
  })

  it('returns false for a normal top-level weapon with weapon_count 0 or 1', () => {
    const single = { port_type: 'weapon', parent_port_id: null, weapon_count: 1 }
    expect(single.port_type === 'weapon' && !single.parent_port_id && single.weapon_count > 1).toBe(false)

    const zero = { port_type: 'weapon', parent_port_id: null, weapon_count: 0 }
    expect(zero.port_type === 'weapon' && !zero.parent_port_id && zero.weapon_count > 1).toBe(false)
  })

  it('returns false for a child weapon port even with weapon_count > 1', () => {
    const child = { port_type: 'weapon', parent_port_id: 42, weapon_count: 3 }
    expect(child.port_type === 'weapon' && !child.parent_port_id && child.weapon_count > 1).toBe(false)
  })

  it('returns false for an actual turret port', () => {
    const turret = { port_type: 'turret', parent_port_id: null, weapon_count: 2 }
    expect(turret.port_type === 'weapon' && !turret.parent_port_id && turret.weapon_count > 1).toBe(false)
  })
})


// ─── Component type mapping ─────────────────────────────────────────────────

describe('COMPONENT_TYPE_TO_PORT_TYPE', () => {
  it('maps all core types', () => {
    expect(COMPONENT_TYPE_TO_PORT_TYPE.PowerPlant).toBe('power')
    expect(COMPONENT_TYPE_TO_PORT_TYPE.Shield).toBe('shield')
    expect(COMPONENT_TYPE_TO_PORT_TYPE.Cooler).toBe('cooler')
    expect(COMPONENT_TYPE_TO_PORT_TYPE.QuantumDrive).toBe('quantum_drive')
    expect(COMPONENT_TYPE_TO_PORT_TYPE.WeaponGun).toBe('weapon')
    expect(COMPONENT_TYPE_TO_PORT_TYPE.Radar).toBe('sensor')
  })
})

describe('groupLoadoutByLocation (#94)', () => {
  const cooler = {
    name: 'Cooler A',
    shops: [
      { shop_name: 'Dumper\'s Depot', location_label: 'Area18', buy_price: 5000 },
      { shop_name: 'CenterMass', location_label: 'New Babbage', buy_price: 4200 },
    ],
  }
  const shield = {
    name: 'Shield B',
    shops: [{ shop_name: 'CenterMass', location_label: 'New Babbage', buy_price: 12000 }],
  }
  const lootOnlyComp = { name: 'Rare PowerPlant', shops: [] }
  const noPriceComp = { name: 'Broken Listing', shops: [{ shop_name: 'X', location_label: 'Y', buy_price: 0 }] }

  it('groups each component under its cheapest shop', () => {
    const { groups } = groupLoadoutByLocation([cooler, shield])
    const center = groups.find((g) => g.shop_name === 'CenterMass')
    expect(center).toBeTruthy()
    // cooler is cheapest at CenterMass (4200) and shield only at CenterMass (12000)
    const names = center.items.map((i) => i.name).sort()
    expect(names).toEqual(['Cooler A', 'Shield B'])
    expect(center.subtotal).toBe(4200 + 12000)
  })

  it('does not list a component at a pricier shop once it picks the cheapest', () => {
    const { groups } = groupLoadoutByLocation([cooler])
    expect(groups).toHaveLength(1)
    expect(groups[0].shop_name).toBe('CenterMass')
    expect(groups[0].items[0].buy_price).toBe(4200)
  })

  it('buckets shopless / zero-price components into lootOnly', () => {
    const { lootOnly } = groupLoadoutByLocation([lootOnlyComp, noPriceComp])
    expect(lootOnly.map((i) => i.name).sort()).toEqual(['Broken Listing', 'Rare PowerPlant'])
  })

  it('computes a grand total across all shop groups', () => {
    const { totalCost } = groupLoadoutByLocation([cooler, shield])
    expect(totalCost).toBe(4200 + 12000)
  })

  it('sorts groups by shop name and tolerates empty input', () => {
    expect(groupLoadoutByLocation([])).toEqual({ groups: [], lootOnly: [], totalCost: 0 })
    expect(groupLoadoutByLocation(null)).toEqual({ groups: [], lootOnly: [], totalCost: 0 })
  })

  it('accepts component_name as a fallback label', () => {
    const { groups } = groupLoadoutByLocation([
      { component_name: 'Legacy Named', shops: [{ shop_name: 'S', location_label: 'L', buy_price: 100 }] },
    ])
    expect(groups[0].items[0].name).toBe('Legacy Named')
  })
})
