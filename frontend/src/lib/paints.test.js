import { describe, it, expect } from 'vitest'
import { paintThumb, pickerPaints, isEquipped, equipTarget, wornPaintName } from './paints'

const standard = { id: 1, name: 'Avenger Titan Standard', is_standard: 1, is_default: 1 }
const red = { id: 2, name: 'Red Livery', image_url_small: 'red.png', is_standard: 0, is_default: 0 }
const blue = { id: 3, name: 'Blue Livery', image_url: 'blue.png', is_standard: 0, is_default: 0 }
const pirate = { id: 4, name: 'Pirate Livery', image_url: 'pirate.png', is_standard: 0, is_default: 1 }

describe('paintThumb', () => {
  it('uses the paint image first', () => {
    expect(paintThumb(red, 'ship.png')).toBe('red.png')
  })
  it('falls back to the ship image only for a Standard livery', () => {
    expect(paintThumb(standard, 'ship.png')).toBe('ship.png')
    expect(paintThumb({ id: 9, is_standard: 0 }, 'ship.png')).toBeNull()
  })
})

describe('pickerPaints', () => {
  it('always offers the default first, even when not owned, then owned paints only', () => {
    const owned = new Set([3])
    expect(pickerPaints([red, blue, standard], owned).map(p => p.id)).toEqual([1, 3])
  })
  it('does not list an owned default twice', () => {
    expect(pickerPaints([standard, red], new Set([1, 2])).map(p => p.id)).toEqual([1, 2])
  })
})

describe('isEquipped / equipTarget', () => {
  it('treats nothing equipped as wearing the default', () => {
    expect(isEquipped(standard, null)).toBe(true)
    expect(isEquipped(red, null)).toBe(false)
  })
  it('highlights an equipped paint by id', () => {
    expect(isEquipped(red, 2)).toBe(true)
    expect(isEquipped(standard, 2)).toBe(false)
  })
  it('stores the default as NULL, including an edition livery', () => {
    expect(equipTarget(standard, 2)).toBeNull()
    expect(equipTarget(pirate, null)).toBeNull()
  })
  it('equips another paint by id, and clicking the equipped one returns to the default', () => {
    expect(equipTarget(red, null)).toBe(2)
    expect(equipTarget(red, 2)).toBeNull()
  })
})

describe('wornPaintName', () => {
  it('prefers the equipped paint, then the hull default', () => {
    expect(wornPaintName({ paint_name: 'Red Livery', default_paint_name: 'X Standard' })).toBe('Red Livery')
    expect(wornPaintName({ paint_name: null, default_paint_name: 'X Standard' })).toBe('X Standard')
    expect(wornPaintName({})).toBeNull()
  })
})
