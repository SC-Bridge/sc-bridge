import { describe, it, expect } from 'vitest'
import { resolveRockEntity, buildMedianBaseByCategory } from './resolveRockEntity'

const COMPS = [
  { uuid: 'c-iron-ctype',        rock_type: 'asteroid_ship', class_name: 'Asteroid_CType_Iron' },
  { uuid: 'c-iron-mtype',        rock_type: 'asteroid_ship', class_name: 'Asteroid_MType_Iron' },
  { uuid: 'c-iron-common-asd',   rock_type: 'asteroid_ship', class_name: 'CommonShipMineablesAsteroid_Iron' },
  { uuid: 'c-iron-common-surf',  rock_type: 'surface_ship',  class_name: 'CommonShipMineables_Iron' },
  { uuid: 'c-unknown',           rock_type: 'ground_vehicle', class_name: 'OrphanGv_X' },
]

const ENTITIES = [
  { uuid: 'e1', composition_uuid: 'c-iron-ctype', rock_category: 'ship_asteroid', laser_damage_full_value: 2500 },
  { uuid: 'e2', composition_uuid: 'c-iron-mtype', rock_category: 'ship_asteroid', laser_damage_full_value: 4500 },
  { uuid: 'e3', composition_uuid: 'c-other',      rock_category: 'ship_planetary', laser_damage_full_value: 1800 },
  { uuid: 'e4', composition_uuid: 'c-other',      rock_category: 'ship_planetary', laser_damage_full_value: 2200 },
]

describe('buildMedianBaseByCategory', () => {
  it('groups entities by rock_category and computes median laser_damage_full_value', () => {
    const map = buildMedianBaseByCategory(ENTITIES)
    expect(map.get('ship_asteroid')).toBe(3500) // median of 2500, 4500
    expect(map.get('ship_planetary')).toBe(2000) // median of 1800, 2200
  })

  it('returns single value as its own median', () => {
    const map = buildMedianBaseByCategory([
      { rock_category: 'fps', laser_damage_full_value: 800 },
    ])
    expect(map.get('fps')).toBe(800)
  })

  it('ignores entities with null laser_damage_full_value', () => {
    const map = buildMedianBaseByCategory([
      { rock_category: 'fps', laser_damage_full_value: 800 },
      { rock_category: 'fps', laser_damage_full_value: null },
    ])
    expect(map.get('fps')).toBe(800)
  })
})

describe('resolveRockEntity', () => {
  const medianByCategory = buildMedianBaseByCategory(ENTITIES)

  it('returns the direct match when a rock_entity points at the composition (preferred)', () => {
    const r = resolveRockEntity('c-iron-ctype', COMPS, ENTITIES, medianByCategory)
    expect(r).toEqual(expect.objectContaining({
      laser_damage_full_value: 2500,
      is_fallback: false,
    }))
  })

  it('returns a synthetic median entity when no direct match but rock_type maps to a known category', () => {
    // c-iron-common-asd has no rock_entity, rock_type=asteroid_ship → ship_asteroid median = 3500
    const r = resolveRockEntity('c-iron-common-asd', COMPS, ENTITIES, medianByCategory)
    expect(r).toEqual(expect.objectContaining({
      laser_damage_full_value: 3500,
      is_fallback: true,
    }))
  })

  it('returns surface_ship → ship_planetary median for CommonShipMineables_X', () => {
    const r = resolveRockEntity('c-iron-common-surf', COMPS, ENTITIES, medianByCategory)
    expect(r).toEqual(expect.objectContaining({
      laser_damage_full_value: 2000,
      is_fallback: true,
    }))
  })

  it('returns null when no entity AND no peers in the same category', () => {
    // c-unknown has rock_type=ground_vehicle but ENTITIES has no ground_vehicle peers
    const r = resolveRockEntity('c-unknown', COMPS, ENTITIES, medianByCategory)
    expect(r).toBeNull()
  })

  it('returns null when composition cannot be found', () => {
    const r = resolveRockEntity('c-nonexistent', COMPS, ENTITIES, medianByCategory)
    expect(r).toBeNull()
  })
})
