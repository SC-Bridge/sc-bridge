import { describe, it, expect } from 'vitest'
import { moduleCargoDelta, totalCargo, maxCargo } from './moduleCargo'

// Retaliator: hull has no grid (null); cargo lives in the front/rear modules.
const retaliator = [
  { uuid: 'f-base', port_name: 'hardpoint_front_module', is_default: 1, cargo: null },
  { uuid: 'f-bomb', port_name: 'hardpoint_front_module', is_default: 0, cargo: null },
  { uuid: 'f-cargo', port_name: 'hardpoint_front_module', is_default: 0, cargo: 38 },
  { uuid: 'r-base', port_name: 'hardpoint_rear_module', is_default: 1, cargo: null },
  { uuid: 'r-cargo', port_name: 'hardpoint_rear_module', is_default: 0, cargo: 36 },
]

// Galaxy: 64 SCU hull, one module bay.
const galaxy = [
  { uuid: 'g-base', port_name: 'hardpoint_module', is_default: 1, cargo: null },
  { uuid: 'g-cargo', port_name: 'hardpoint_module', is_default: 0, cargo: 656 },
  { uuid: 'g-med', port_name: 'hardpoint_module', is_default: 0, cargo: 4 },
]

describe('moduleCargoDelta', () => {
  it('is 0 with the default modules fitted', () => {
    expect(moduleCargoDelta(retaliator, {})).toBe(0)
    expect(moduleCargoDelta(retaliator, undefined)).toBe(0)
  })

  it('adds each equipped module', () => {
    expect(moduleCargoDelta(retaliator, { hardpoint_front_module: 'f-cargo' })).toBe(38)
    expect(moduleCargoDelta(retaliator, { hardpoint_front_module: 'f-cargo', hardpoint_rear_module: 'r-cargo' })).toBe(74)
  })

  it('subtracts a default module that is swapped out — the hull figure already includes it', () => {
    const cargoByDefault = [
      { uuid: 'c', port_name: 'hardpoint_module', is_default: 1, cargo: 656 },
      { uuid: 'b', port_name: 'hardpoint_module', is_default: 0, cargo: null },
      { uuid: 'm', port_name: 'hardpoint_module', is_default: 0, cargo: 4 },
    ]
    expect(moduleCargoDelta(cargoByDefault, {})).toBe(0)
    expect(moduleCargoDelta(cargoByDefault, { hardpoint_module: 'b' })).toBe(-656)
    expect(moduleCargoDelta(cargoByDefault, { hardpoint_module: 'm' })).toBe(-652)
  })

  it('ignores a selection that matches no module on the port', () => {
    expect(moduleCargoDelta(galaxy, { hardpoint_module: 'gone' })).toBe(0)
  })

  it('handles no modules', () => {
    expect(moduleCargoDelta(undefined, {})).toBe(0)
    expect(moduleCargoDelta([], {})).toBe(0)
  })
})

describe('totalCargo', () => {
  it('is null for a hull with no grid and no cargo module (shown as a dash)', () => {
    expect(totalCargo(null, retaliator, {})).toBeNull()
    expect(totalCargo(null, retaliator, { hardpoint_front_module: 'f-bomb' })).toBeNull()
    expect(totalCargo(null, undefined, undefined)).toBeNull()
  })

  it('is the module cargo when the hull has none', () => {
    expect(totalCargo(null, retaliator, { hardpoint_front_module: 'f-cargo', hardpoint_rear_module: 'r-cargo' })).toBe(74)
  })

  it('is hull plus the equipped module', () => {
    expect(totalCargo(64, galaxy, {})).toBe(64)
    expect(totalCargo(64, galaxy, { hardpoint_module: 'g-cargo' })).toBe(720)
    expect(totalCargo(64, galaxy, { hardpoint_module: 'g-med' })).toBe(68)
  })

  it('leaves a ship without modules untouched', () => {
    expect(totalCargo(96, [], {})).toBe(96)
    expect(totalCargo(96, undefined, undefined)).toBe(96)
  })
})

describe('maxCargo', () => {
  it('is the best module on every port', () => {
    expect(maxCargo(null, retaliator)).toBe(74)
    expect(maxCargo(64, galaxy)).toBe(720)
  })

  it('is the stock figure when no module adds cargo', () => {
    expect(maxCargo(32, [{ uuid: 'a', port_name: 'p', is_default: 1, cargo: null }])).toBe(32)
    expect(maxCargo(null, [])).toBeNull()
  })
})
