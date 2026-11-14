import { describe, it, expect } from 'vitest'
import { visibleModules, visibleSelections } from './moduleVisibility'

const galaxy = [
  { uuid: 'g-stock', port_name: 'hardpoint_module', display_name: 'Galaxy Stock Module', is_default: 1 },
  { uuid: 'g-template', port_name: 'hardpoint_module', display_name: null, class_name: 'RSI_Galaxy_Module', is_default: 0 },
  { uuid: 'g-refinery', port_name: 'hardpoint_module', display_name: '   ', class_name: 'RSI_Galaxy_Module_Refinery', is_default: 0 },
  { uuid: 'g-cargo', port_name: 'hardpoint_module', display_name: 'Galaxy Cargo Module', is_default: 0 },
]

describe('visibleModules', () => {
  it('drops modules with no display name (null, empty or blank)', () => {
    expect(visibleModules(galaxy).map(m => m.uuid)).toEqual(['g-stock', 'g-cargo'])
  })

  it('keeps a nameless module when it is the default — it is what the ship is fitted with', () => {
    const mods = [
      { uuid: 'd', port_name: 'p', display_name: null, class_name: 'X_Module', is_default: 1 },
      { uuid: 'o', port_name: 'p', display_name: 'Cargo', is_default: 0 },
    ]
    expect(visibleModules(mods).map(m => m.uuid)).toEqual(['d', 'o'])
  })

  it('returns an empty list for missing input', () => {
    expect(visibleModules(undefined)).toEqual([])
    expect(visibleModules(null)).toEqual([])
  })
})

describe('visibleSelections', () => {
  it('keeps a selection that points at a visible module', () => {
    expect(visibleSelections(galaxy, { hardpoint_module: 'g-cargo' })).toEqual({ hardpoint_module: 'g-cargo' })
  })

  it('drops a selection that points at a hidden module, so the port falls back to its default', () => {
    expect(visibleSelections(galaxy, { hardpoint_module: 'g-template' })).toEqual({})
  })

  it('drops a selection for a module that no longer exists', () => {
    expect(visibleSelections(galaxy, { hardpoint_module: 'gone' })).toEqual({})
  })

  it('passes undefined through (read-only callers have no selections)', () => {
    expect(visibleSelections(galaxy, undefined)).toBeUndefined()
  })
})
