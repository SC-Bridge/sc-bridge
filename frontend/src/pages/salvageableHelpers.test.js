import { describe, it, expect } from 'vitest'
import {
  shipVariantTypes, collectVariantTypes, filterSalvageableShips, variantLabel,
} from './salvageableHelpers'

const SHIPS = [
  { slug: 'cutlass-black', name: 'Cutlass Black', manufacturer_name: 'Drake', variant_types: 'derelict_salvage, boarded', variant_count: 2 },
  { slug: 'reclaimer', name: 'Reclaimer', manufacturer_name: 'Aegis', variant_types: 'derelict', variant_count: 1 },
  { slug: 'vulture', name: 'Vulture', manufacturer_name: 'Drake', variant_types: '', variant_count: 0 },
]

describe('shipVariantTypes', () => {
  it('splits and trims the comma-separated string', () => {
    expect(shipVariantTypes(SHIPS[0])).toEqual(['derelict_salvage', 'boarded'])
  })
  it('returns [] for empty/missing', () => {
    expect(shipVariantTypes(SHIPS[2])).toEqual([])
    expect(shipVariantTypes({})).toEqual([])
  })
})

describe('collectVariantTypes', () => {
  it('returns the sorted distinct set across all ships', () => {
    expect(collectVariantTypes(SHIPS)).toEqual(['boarded', 'derelict', 'derelict_salvage'])
  })
  it('tolerates null', () => {
    expect(collectVariantTypes(null)).toEqual([])
  })
})

describe('filterSalvageableShips', () => {
  it('returns all ships with no filters', () => {
    expect(filterSalvageableShips(SHIPS)).toHaveLength(3)
  })
  it('filters by variant type', () => {
    const r = filterSalvageableShips(SHIPS, { variant: 'derelict' })
    expect(r.map((s) => s.slug)).toEqual(['reclaimer'])
  })
  it('matches a ship that has the variant among several', () => {
    const r = filterSalvageableShips(SHIPS, { variant: 'boarded' })
    expect(r.map((s) => s.slug)).toEqual(['cutlass-black'])
  })
  it('searches name and manufacturer case-insensitively', () => {
    expect(filterSalvageableShips(SHIPS, { search: 'drake' }).map((s) => s.slug)).toEqual(['cutlass-black', 'vulture'])
    expect(filterSalvageableShips(SHIPS, { search: 'recl' }).map((s) => s.slug)).toEqual(['reclaimer'])
  })
  it('composes search and variant', () => {
    expect(filterSalvageableShips(SHIPS, { search: 'drake', variant: 'boarded' }).map((s) => s.slug)).toEqual(['cutlass-black'])
  })
})

describe('variantLabel', () => {
  it('maps known types and falls back to the raw value', () => {
    expect(variantLabel('derelict_salvage')).toBe('Derelict (Salvage)')
    expect(variantLabel('mystery')).toBe('mystery')
  })
})
