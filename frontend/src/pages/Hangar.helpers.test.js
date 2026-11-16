import { describe, it, expect } from 'vitest'
import {
  buildItemFilter, cleanPledgeName, formatPledgeValue,
  kindLabel, orderedKinds, KIND_ORDER, normaliseMediaUrl, countKinds,
} from './Hangar.helpers'

describe('cleanPledgeName', () => {
  it('strips Standalone Ship(s) prefix', () => {
    expect(cleanPledgeName('Standalone Ships - Carrack')).toBe('Carrack')
    expect(cleanPledgeName('Standalone Ship - Aurora MR')).toBe('Aurora MR')
  })

  it('strips Package / Add-Ons / Combo prefixes', () => {
    expect(cleanPledgeName('Package - Anniversary 2954')).toBe('Anniversary 2954')
    expect(cleanPledgeName('Add-Ons - LTI Token')).toBe('LTI Token')
    expect(cleanPledgeName('Combo - Aurora Pack')).toBe('Aurora Pack')
  })

  it('rewrites Upgrade prefix as CCU:', () => {
    expect(cleanPledgeName('Upgrade - Aurora to Avenger')).toBe('CCU: Aurora to Avenger')
  })

  it('returns null for nullish input', () => {
    expect(cleanPledgeName(null)).toBeNull()
    expect(cleanPledgeName(undefined)).toBeNull()
    expect(cleanPledgeName('')).toBeNull()
  })

  it('leaves non-prefixed names untouched', () => {
    expect(cleanPledgeName('Carrack — Best in Show')).toBe('Carrack — Best in Show')
  })
})

describe('formatPledgeValue', () => {
  it('formats dollar value with thousand separators', () => {
    expect(formatPledgeValue(60000)).toBe('$600')
    expect(formatPledgeValue(123456)).toBe('$1,235')
    expect(formatPledgeValue(1000000)).toBe('$10,000')
  })

  it('returns null for zero / null / undefined', () => {
    expect(formatPledgeValue(null)).toBeNull()
    expect(formatPledgeValue(undefined)).toBeNull()
    expect(formatPledgeValue(0)).toBeNull()
  })
})

describe('kindLabel', () => {
  it('returns "Uncategorised" for the bucket key', () => {
    expect(kindLabel('uncategorised')).toBe('Uncategorised')
  })

  it('returns the kind verbatim otherwise', () => {
    expect(kindLabel('Ship')).toBe('Ship')
    expect(kindLabel('FPS Equipment')).toBe('FPS Equipment')
  })

  it('relabels Skin to Paints for the user-facing chip', () => {
    expect(kindLabel('Skin')).toBe('Paints')
  })
})

describe('normaliseMediaUrl', () => {
  it('returns absolute URLs unchanged', () => {
    expect(normaliseMediaUrl('https://media.robertsspaceindustries.com/x/y.jpg'))
      .toBe('https://media.robertsspaceindustries.com/x/y.jpg')
  })

  it('prepends https://media.robertsspaceindustries.com to /media/ paths', () => {
    expect(normaliseMediaUrl('/media/d8ktckex1ucmrr/subscribers_vault_thumbnail/Banu3.jpg'))
      .toBe('https://media.robertsspaceindustries.com/media/d8ktckex1ucmrr/subscribers_vault_thumbnail/Banu3.jpg')
  })

  it('returns empty/null unchanged', () => {
    expect(normaliseMediaUrl('')).toBe('')
    expect(normaliseMediaUrl(null)).toBe(null)
    expect(normaliseMediaUrl(undefined)).toBe(undefined)
  })

  it('leaves other relative or weird strings untouched', () => {
    expect(normaliseMediaUrl('cf-image-id-only')).toBe('cf-image-id-only')
  })
})

describe('orderedKinds', () => {
  it('uses canonical order for known kinds', () => {
    const counts = { Ship: 5, Skin: 3, Insurance: 2 }
    expect(orderedKinds(counts)).toEqual(['Ship', 'Skin', 'Insurance'])
  })

  it('appends unknown kinds after canonical ones', () => {
    const counts = { Ship: 1, NewKind: 1, Skin: 1 }
    expect(orderedKinds(counts)).toEqual(['Ship', 'Skin', 'NewKind'])
  })

  it('places uncategorised last regardless of input order', () => {
    const counts = { uncategorised: 5, Ship: 2, Skin: 1 }
    expect(orderedKinds(counts)).toEqual(['Ship', 'Skin', 'uncategorised'])
  })

  it('omits kinds with zero count', () => {
    const counts = { Ship: 1, Skin: 0, Insurance: 2 }
    expect(orderedKinds(counts)).toEqual(['Ship', 'Insurance'])
  })

  it('returns empty array on empty input', () => {
    expect(orderedKinds({})).toEqual([])
  })

  it('canonical order matches export', () => {
    expect(KIND_ORDER[0]).toBe('Ship')
    expect(KIND_ORDER).toContain('Insurance')
    expect(KIND_ORDER).toContain('Hangar decoration')
  })
})

describe('buildItemFilter', () => {
  const sample = [
    { id: 1, title: 'Carrack', kind: 'Ship', manufacturer_code: 'ANVL', manufacturer_name: 'Anvil', pledge_name: 'Standalone Ships - Carrack', custom_name: 'Jean-Luc' },
    { id: 2, title: 'Lifetime Insurance', kind: 'Insurance', manufacturer_code: null, pledge_name: 'Standalone Ships - Carrack' },
    { id: 3, title: 'Sabine Undersuit Red Festival', kind: null, manufacturer_code: 'CLVI', manufacturer_name: 'Calva', pledge_name: 'Festival Pack' },
    { id: 4, title: 'Aurora MR', kind: 'Ship', manufacturer_code: 'RSI', manufacturer_name: 'Roberts Space Industries', pledge_name: 'Package - Aurora MR' },
  ]

  it('returns all when no filters set', () => {
    const fn = buildItemFilter({ search: '', kindFilter: 'all', mfrFilter: 'all' })
    expect(sample.filter(fn)).toHaveLength(4)
  })

  it('filters by kind', () => {
    const fn = buildItemFilter({ search: '', kindFilter: 'Ship', mfrFilter: 'all' })
    const got = sample.filter(fn).map(i => i.id).sort()
    expect(got).toEqual([1, 4])
  })

  it('filters NULL kind under uncategorised bucket', () => {
    const fn = buildItemFilter({ search: '', kindFilter: 'uncategorised', mfrFilter: 'all' })
    expect(sample.filter(fn).map(i => i.id)).toEqual([3])
  })

  it('filters by manufacturer code', () => {
    const fn = buildItemFilter({ search: '', kindFilter: 'all', mfrFilter: 'ANVL' })
    expect(sample.filter(fn).map(i => i.id)).toEqual([1])
  })

  it('search hits title, custom_name, manufacturer, pledge_name', () => {
    expect(sample.filter(buildItemFilter({ search: 'jean-luc', kindFilter: 'all', mfrFilter: 'all' })).map(i => i.id))
      .toEqual([1])
    expect(sample.filter(buildItemFilter({ search: 'aurora', kindFilter: 'all', mfrFilter: 'all' })).map(i => i.id))
      .toEqual([4])
    expect(sample.filter(buildItemFilter({ search: 'calva', kindFilter: 'all', mfrFilter: 'all' })).map(i => i.id))
      .toEqual([3])
    expect(sample.filter(buildItemFilter({ search: 'standalone', kindFilter: 'all', mfrFilter: 'all' })).map(i => i.id).sort())
      .toEqual([1, 2])
  })

  it('search is case-insensitive', () => {
    const fn = buildItemFilter({ search: 'CARRACK', kindFilter: 'all', mfrFilter: 'all' })
    expect(sample.filter(fn).map(i => i.id).sort()).toEqual([1, 2])
  })

  it('combines kind + search', () => {
    const fn = buildItemFilter({ search: 'aurora', kindFilter: 'Ship', mfrFilter: 'all' })
    expect(sample.filter(fn).map(i => i.id)).toEqual([4])
  })

  it('returns nothing when search has no hits', () => {
    const fn = buildItemFilter({ search: 'zzz-no-match', kindFilter: 'all', mfrFilter: 'all' })
    expect(sample.filter(fn)).toEqual([])
  })
})

describe('countKinds', () => {
  it('counts items per kind and buckets a null kind as uncategorised', () => {
    expect(countKinds([
      { kind: 'Ship' }, { kind: 'Ship' }, { kind: 'Skin' }, { kind: null }, {},
    ])).toEqual({ Ship: 2, Skin: 1, uncategorised: 2 })
  })

  it('returns an empty object for no items', () => {
    expect(countKinds([])).toEqual({})
  })
})
