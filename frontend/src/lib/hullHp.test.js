import { describe, it, expect } from 'vitest'
import { hullTotal, hullPartLabel, hullPartRows } from './hullHp'

// Parts as the 4.10.3-live pipeline wrote them (tools enrich/vehicle_xml.py).
const CARRACK = [
  { name: 'middle', hp: 70000, parent: null, vital: true },
  { name: 'rear', hp: 3000, parent: 'middle', vital: false },
  { name: 'Wings_L', hp: 5000, parent: 'rear', vital: false },
  { name: 'Wings_R', hp: 5000, parent: 'rear', vital: false },
  { name: 'front', hp: 5000, parent: 'middle', vital: false },
]

describe('hullTotal', () => {
  it('is the total when the API has one', () => {
    expect(hullTotal({ hull_hp: 70000, hull_hp_total: 88000 })).toBe(88000)
  })
  it('falls back to the hull part for a response cached before the total existed', () => {
    expect(hullTotal({ hull_hp: 70000 })).toBe(70000)
  })
  it('is null when neither is known (ATLS power suits)', () => {
    expect(hullTotal({ hull_hp: null, hull_hp_total: null })).toBeNull()
    expect(hullTotal(undefined)).toBeNull()
  })
})

describe('hullPartLabel', () => {
  it('splits underscores and camel case into words', () => {
    expect(hullPartLabel('Thruster_Main_Base_Left')).toBe('Thruster Main Base Left')
    expect(hullPartLabel('WingLeft_Tip')).toBe('Wing Left Tip')
    expect(hullPartLabel('middle')).toBe('Middle')
    expect(hullPartLabel('Wings_L')).toBe('Wings L')
  })
  it('drops the geo_/dmg_ mesh prefixes and the $ LOD marker', () => {
    expect(hullPartLabel('geo_body_right')).toBe('Body Right')
    expect(hullPartLabel('dmg_panel_nose_left_b')).toBe('Panel Nose Left B')
    expect(hullPartLabel('$lod1_livery_decal')).toBe('Lod1 Livery Decal')
  })
  it('names the root part after the ship "Chassis"', () => {
    expect(hullPartLabel('TMBL_Cyclone', 'TMBL_Cyclone')).toBe('Chassis')
    expect(hullPartLabel('tmbl_cyclone', 'TMBL_Cyclone')).toBe('Chassis')
    expect(hullPartLabel('Body', 'TMBL_Cyclone')).toBe('Body')
  })
})

describe('hullPartRows', () => {
  it('keeps XML order and gives each part its depth under its parent', () => {
    expect(hullPartRows(CARRACK).map(r => [r.name, r.depth])).toEqual([
      ['middle', 0], ['rear', 1], ['Wings_L', 2], ['Wings_R', 2], ['front', 1],
    ])
  })
  it('is empty for a missing or non-array value', () => {
    expect(hullPartRows(null)).toEqual([])
    expect(hullPartRows('[]')).toEqual([])
  })
})
