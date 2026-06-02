import { describe, it, expect } from 'vitest'
import { encodeLoadoutParams, decodeLoadoutParams } from './loadoutCodec'

// Minimal mining `data` shape for id resolution.
const data = {
  lasers: [{ id: 10, name: 'Helix II', size: 2, module_slots: 2 }, { id: 11, name: 'Lancet', size: 2, module_slots: 1 }],
  modules: [{ id: 50, name: 'Rime' }, { id: 51, name: 'Surge' }],
  gadgets: [{ id: 90, name: 'Sabir' }],
  compositions: [{ uuid: 'c-iron', deposit_name: 'Iron (Ore)' }],
}

describe('encodeLoadoutParams', () => {
  it('encodes ship, lasers, modules, gadget and rock pick by id', () => {
    const p = encodeLoadoutParams({
      shipIndex: 1,
      laserIds: { 0: { id: 10 } },
      moduleIds: { '0-0': { id: 50 }, '0-1': { id: 51 } },
      gadget: { id: 90 },
      pick: { depositName: 'Iron (Ore)', compositionUuid: 'c-iron' },
    })
    expect(p).toEqual({
      ship: '1',
      l0: '10',
      'm0-0': '50',
      'm0-1': '51',
      gadget: '90',
      rock: 'Iron (Ore)',
      el: 'c-iron',
    })
  })

  it('omits empty selections', () => {
    const p = encodeLoadoutParams({
      shipIndex: 0, laserIds: {}, moduleIds: {}, gadget: null, pick: { depositName: null, compositionUuid: null },
    })
    expect(p).toEqual({ ship: '0' })
  })
})

describe('decodeLoadoutParams', () => {
  it('round-trips an encoded loadout back to selections', () => {
    const encoded = encodeLoadoutParams({
      shipIndex: 1,
      laserIds: { 0: { id: 10 } },
      moduleIds: { '0-0': { id: 50 }, '0-1': { id: 51 } },
      gadget: { id: 90 },
      pick: { depositName: 'Iron (Ore)', compositionUuid: 'c-iron' },
    })
    const sp = new URLSearchParams(encoded)
    const out = decodeLoadoutParams(sp, data)
    expect(out.shipIndex).toBe(1)
    expect(out.laserIds[0]).toMatchObject({ id: 10 })
    expect(out.moduleIds['0-0']).toMatchObject({ id: 50 })
    expect(out.moduleIds['0-1']).toMatchObject({ id: 51 })
    expect(out.gadget).toMatchObject({ id: 90 })
    expect(out.pick).toEqual({ depositName: 'Iron (Ore)', compositionUuid: 'c-iron' })
  })

  it('returns null when no loadout params present', () => {
    expect(decodeLoadoutParams(new URLSearchParams('tab=calculator'), data)).toBeNull()
  })

  it('ignores ids that no longer exist in data (patch drift) without throwing', () => {
    const sp = new URLSearchParams({ ship: '0', l0: '999', 'm0-0': '888', gadget: '777' })
    const out = decodeLoadoutParams(sp, data)
    expect(out.shipIndex).toBe(0)
    expect(out.laserIds[0]).toBeUndefined()
    expect(out.moduleIds['0-0']).toBeUndefined()
    expect(out.gadget).toBeNull()
  })

  it('clamps an out-of-range ship index to 0', () => {
    const sp = new URLSearchParams({ ship: '99' })
    expect(decodeLoadoutParams(sp, data, 5).shipIndex).toBe(0)
  })
})
