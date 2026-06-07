import { describe, it, expect } from 'vitest'
import { formatStaleness, resolveLocationEntry, matchesShowFilter, buildSyntheticItem, applyBuildMultipliers } from './lootHelpers'

// 2026-06-01 UTC — anchor for deterministic age calculations.
const NOW = Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000)

describe('formatStaleness', () => {
  it('returns null for missing or invalid input', () => {
    expect(formatStaleness(null, NOW)).toBeNull()
    expect(formatStaleness(undefined, NOW)).toBeNull()
    expect(formatStaleness(0, NOW)).toBeNull()
    expect(formatStaleness('not-a-number', NOW)).toBeNull()
  })

  it('uses <1m for fresh reports (under 60s)', () => {
    expect(formatStaleness(NOW - 0, NOW)).toBe('<1m')
    expect(formatStaleness(NOW - 30, NOW)).toBe('<1m')
    expect(formatStaleness(NOW - 59, NOW)).toBe('<1m')
  })

  it('uses minutes for under-1-hour reports', () => {
    expect(formatStaleness(NOW - 60, NOW)).toBe('1m')
    expect(formatStaleness(NOW - 60 * 17, NOW)).toBe('17m')
    expect(formatStaleness(NOW - (3600 - 1), NOW)).toBe('59m')
  })

  it('uses hours for under-1-day reports', () => {
    expect(formatStaleness(NOW - 3600, NOW)).toBe('1h')
    expect(formatStaleness(NOW - 3600 * 9, NOW)).toBe('9h')
    expect(formatStaleness(NOW - (86400 - 1), NOW)).toBe('23h')
  })

  it('uses days for older reports', () => {
    expect(formatStaleness(NOW - 86400, NOW)).toBe('1d')
    expect(formatStaleness(NOW - 86400 * 17, NOW)).toBe('17d')
    expect(formatStaleness(NOW - 86400 * 365, NOW)).toBe('365d')
  })

  it('clamps negative ages (future timestamps) to <1m', () => {
    expect(formatStaleness(NOW + 60, NOW)).toBe('<1m')
  })
})

describe('resolveLocationEntry — shops with UEX staleness', () => {
  it('appends the staleness badge when uex_date_modified is present', () => {
    // 17 days ago at the time of the test mount (uses real now, so a wider
    // tolerance check). We assert the bracketed suffix shape, not the exact
    // value (since we can't inject `now` into the resolver from here).
    const seventeenDaysAgo = Math.floor(Date.now() / 1000) - 86400 * 17
    const r = resolveLocationEntry(
      {
        shop_name: 'CenterMass Area 18',
        buy_price: 15000,
        sell_price: 18000,
        uex_date_modified: seventeenDaysAgo,
      },
      'shops',
    )
    expect(r.detail).toContain('Buy: 15,000 · Sell: 18,000 aUEC')
    expect(r.detail).toMatch(/\(17d\)$/)
  })

  it('omits the staleness badge when uex_date_modified is absent', () => {
    const r = resolveLocationEntry(
      { shop_name: 'CenterMass Area 18', buy_price: 100, sell_price: 200 },
      'shops',
    )
    expect(r.detail).toBe('Buy: 100 · Sell: 200 aUEC')
    expect(r.detail).not.toMatch(/\(.*\)$/)
  })

  it('does not append staleness when prices are missing (detail = "Price unknown")', () => {
    const r = resolveLocationEntry(
      {
        shop_name: 'CenterMass Area 18',
        uex_date_modified: Math.floor(Date.now() / 1000) - 86400 * 5,
      },
      'shops',
    )
    expect(r.detail).toBe('Price unknown')
  })
})

describe('matchesShowFilter — collection/wishlist/crafted overlay (#92)', () => {
  // uuids: looted, crafted, both-wishlisted, none
  const looted = { uuid: 'u-looted' }
  const crafted = { uuid: 'u-crafted' }
  const wished = { uuid: 'u-wished' }
  const plain = { uuid: 'u-plain' }

  const ctx = {
    collected: new Map([['u-looted', 2]]),
    wishlistIds: new Set(['u-wished']),
    craftedMap: { 'u-crafted': 3 },
  }

  it('"all" matches every item', () => {
    for (const item of [looted, crafted, wished, plain]) {
      expect(matchesShowFilter(item, 'all', ctx)).toBe(true)
    }
  })

  it('"collected" includes both looted AND crafted items', () => {
    expect(matchesShowFilter(looted, 'collected', ctx)).toBe(true)
    expect(matchesShowFilter(crafted, 'collected', ctx)).toBe(true)
    expect(matchesShowFilter(wished, 'collected', ctx)).toBe(false)
    expect(matchesShowFilter(plain, 'collected', ctx)).toBe(false)
  })

  it('"uncollected" excludes anything you have (looted or crafted)', () => {
    expect(matchesShowFilter(looted, 'uncollected', ctx)).toBe(false)
    expect(matchesShowFilter(crafted, 'uncollected', ctx)).toBe(false)
    expect(matchesShowFilter(wished, 'uncollected', ctx)).toBe(true)
    expect(matchesShowFilter(plain, 'uncollected', ctx)).toBe(true)
  })

  it('"wishlisted" matches only wishlisted items', () => {
    expect(matchesShowFilter(wished, 'wishlisted', ctx)).toBe(true)
    expect(matchesShowFilter(looted, 'wishlisted', ctx)).toBe(false)
  })

  it('"crafted" matches only items with a crafted quantity > 0', () => {
    expect(matchesShowFilter(crafted, 'crafted', ctx)).toBe(true)
    expect(matchesShowFilter(looted, 'crafted', ctx)).toBe(false)
    expect(matchesShowFilter(plain, 'crafted', ctx)).toBe(false)
  })

  it('treats a zero crafted quantity as not-crafted', () => {
    const zeroCtx = { ...ctx, craftedMap: { 'u-crafted': 0 } }
    expect(matchesShowFilter(crafted, 'crafted', zeroCtx)).toBe(false)
    expect(matchesShowFilter(crafted, 'collected', zeroCtx)).toBe(false)
  })

  it('tolerates a missing craftedMap (unauthed / not yet loaded)', () => {
    const noCrafted = { collected: new Map(), wishlistIds: new Set(), craftedMap: undefined }
    expect(matchesShowFilter(crafted, 'crafted', noCrafted)).toBe(false)
    expect(matchesShowFilter(crafted, 'collected', noCrafted)).toBe(false)
    expect(matchesShowFilter(crafted, 'all', noCrafted)).toBe(true)
  })
})

describe('buildSyntheticItem (#90 — builds as Item-Finder items)', () => {
  const baseWeapon = { uuid: 'u1', name: 'FS-9 LMG', type: 'weapon', damage: 40, rounds_per_minute: 650, dps: 157.1 }

  it('returns null without a base item', () => {
    expect(buildSyntheticItem(null, { id: 1, name: 'x', multipliers: {} })).toBeNull()
  })

  it('scales damage/rpm and recomputes dps from the build multipliers', () => {
    const item = buildSyntheticItem(baseWeapon, {
      id: 9, name: 'Full Send 9', crafted: 2,
      multipliers: { weapon_damage: 1.2, weapon_firerate: 1.1 },
    })
    expect(item.damage).toBeCloseTo(48, 5)        // 40 × 1.2
    expect(item.rounds_per_minute).toBeCloseTo(715, 5) // 650 × 1.1
    expect(item.dps).toBeCloseTo(157.1 * 1.2 * 1.1, 4)
  })

  it('carries build metadata + a base→tuned lift, and a unique id', () => {
    const item = buildSyntheticItem(baseWeapon, { id: 9, name: 'Full Send 9', crafted: 3, multipliers: { weapon_damage: 1.25 } })
    expect(item.id).toBe('build-9')
    expect(item.name).toBe('Full Send 9')
    expect(item._build).toMatchObject({ id: 9, name: 'Full Send 9', crafted: 3, baseName: 'FS-9 LMG' })
    expect(item._lift.label).toBe('DPS')
    expect(item._lift.base).toBe(157.1)
    expect(item._lift.tuned).toBeCloseTo(157.1 * 1.25, 4)
  })

  it('no multipliers → base stats, no lift (e.g. QT drive build with no modifiers)', () => {
    const drive = { uuid: 'd1', name: 'Quantum Drive', type: 'QuantumDrive', quantum_speed: 100 }
    const item = buildSyntheticItem(drive, { id: 4, name: 'My Drive', crafted: 0, multipliers: {} })
    expect(item.quantum_speed).toBe(100)
    expect(item._lift).toBeUndefined()
    expect(item._build.name).toBe('My Drive')
  })

  it('scales armour resists by damagemitigation', () => {
    const armour = { uuid: 'a1', name: 'Plate', type: 'armour', resist_physical: 0.3, resist_energy: 0.2 }
    const item = buildSyntheticItem(armour, { id: 7, name: 'Tank', crafted: 0, multipliers: { armor_damagemitigation: 1.4 } })
    expect(item.resist_physical).toBeCloseTo(0.42, 5)
    expect(item.resist_energy).toBeCloseTo(0.28, 5)
  })

  it('carries blueprintId + multipliers on _build for the detail-panel link', () => {
    const item = buildSyntheticItem(baseWeapon, {
      id: 9, name: 'Full Send 9', crafted: 2, blueprintId: 474,
      multipliers: { weapon_damage: 1.25 },
    })
    expect(item._build.blueprintId).toBe(474)
    expect(item._build.multipliers).toEqual({ weapon_damage: 1.25 })
    expect(item._build.baseUuid).toBe('u1')
  })
})

describe('applyBuildMultipliers (shared by card + detail panel)', () => {
  it('scales mapped fields and recomputes dps without mutating the input', () => {
    const det = { damage: 40, rounds_per_minute: 650, dps: 157.1, effective_range: 50 }
    const out = applyBuildMultipliers(det, { weapon_damage: 1.2, weapon_firerate: 1.1 })
    expect(out.damage).toBeCloseTo(48, 5)
    expect(out.rounds_per_minute).toBeCloseTo(715, 5)
    expect(out.dps).toBeCloseTo(157.1 * 1.2 * 1.1, 4)
    expect(out.effective_range).toBe(50) // untouched
    expect(det.damage).toBe(40)          // input not mutated
  })

  it('no multipliers → returns an equivalent object', () => {
    const det = { quantum_speed: 100 }
    expect(applyBuildMultipliers(det, {})).toEqual({ quantum_speed: 100 })
  })

  it('tolerates null details', () => {
    expect(applyBuildMultipliers(null, { weapon_damage: 2 })).toBeNull()
  })
})
