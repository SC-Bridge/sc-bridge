import { describe, it, expect } from 'vitest'
import { portCapacity, SLOT_FAMILY } from './portCapacity'

const core = (weight) => ({ base_stats: { armour_weight: weight } })
const LEGS = { base_stats: { armour_weight: 'light' } }

describe('portCapacity', () => {
  it('heavy core + legs → 4 grenades, 8 mags, 2 slings, 4 pens, 1 gadget, 1 knife', () => {
    expect(portCapacity(core('heavy'), LEGS)).toEqual({ grenades: 4, mags: 8, slings: 2, pens: 4, utilGadget: 1, utilKnife: 1 })
  })

  it('light core + legs → 2 grenades, 4 mags, 1 sling', () => {
    expect(portCapacity(core('light'), LEGS)).toEqual({ grenades: 2, mags: 4, slings: 1, pens: 4, utilGadget: 1, utilKnife: 1 })
  })

  it('medium core + legs → 3 grenades, 6 mags, 2 slings', () => {
    expect(portCapacity(core('medium'), LEGS)).toEqual({ grenades: 3, mags: 6, slings: 2, pens: 4, utilGadget: 1, utilKnife: 1 })
  })

  it('no core → grenade/mag/sling groups zeroed, legs groups intact', () => {
    expect(portCapacity(null, LEGS)).toEqual({ grenades: 0, mags: 0, slings: 0, pens: 4, utilGadget: 1, utilKnife: 1 })
  })

  it('no legs → pens/util groups zeroed, core groups intact', () => {
    expect(portCapacity(core('heavy'), null)).toEqual({ grenades: 4, mags: 8, slings: 2, pens: 0, utilGadget: 0, utilKnife: 0 })
  })

  it('unknown/Personal weight core falls back to the light row', () => {
    expect(portCapacity(core('Personal'), LEGS)).toEqual({ grenades: 2, mags: 4, slings: 1, pens: 4, utilGadget: 1, utilKnife: 1 })
    expect(portCapacity({ base_stats: {} }, LEGS)).toEqual({ grenades: 2, mags: 4, slings: 1, pens: 4, utilGadget: 1, utilKnife: 1 })
  })
})

describe('SLOT_FAMILY', () => {
  it('parses ordinal family slot keys', () => {
    expect(SLOT_FAMILY('grenade_3')).toEqual({ family: 'grenades', index: 3 })
    expect(SLOT_FAMILY('mag_7')).toEqual({ family: 'mags', index: 7 })
    expect(SLOT_FAMILY('sling_2')).toEqual({ family: 'slings', index: 2 })
    expect(SLOT_FAMILY('pen_4')).toEqual({ family: 'pens', index: 4 })
  })

  it('parses the two singleton util slots', () => {
    expect(SLOT_FAMILY('util_gadget')).toEqual({ family: 'utilGadget', index: 1 })
    expect(SLOT_FAMILY('util_knife')).toEqual({ family: 'utilKnife', index: 1 })
  })

  it('returns a null family for non-utility slot keys', () => {
    expect(SLOT_FAMILY('primary')).toEqual({ family: null, index: 0 })
    expect(SLOT_FAMILY('core')).toEqual({ family: null, index: 0 })
    expect(SLOT_FAMILY(undefined)).toEqual({ family: null, index: 0 })
  })
})
