import { describe, it, expect, beforeEach } from 'vitest'
import {
  serializeLoadout, resolveLoadout, upsertLoadout, removeLoadout,
  readLocalLoadouts, writeLocalLoadouts, LOCAL_KEY, MAX_LOADOUTS,
} from './loadoutStore'

const data = {
  lasers: [{ id: 10, name: 'Helix II', size: 2, module_slots: 2 }],
  modules: [{ id: 50, name: 'Rime' }, { id: 51, name: 'Surge' }],
  gadgets: [{ id: 90, name: 'Sabir' }],
}

describe('serializeLoadout / resolveLoadout', () => {
  it('serializes selections to a compact id-only shape (no rock)', () => {
    const entry = serializeLoadout('My MOLE', {
      shipIndex: 1,
      laserIds: { 0: { id: 10 } },
      moduleIds: { '0-0': { id: 50 }, '0-1': { id: 51 } },
      gadget: { id: 90 },
      pick: { depositName: 'Iron (Ore)' }, // must NOT be saved
    })
    expect(entry).toEqual({
      name: 'My MOLE', ship: 1, laserIds: { 0: 10 }, moduleIds: { '0-0': 50, '0-1': 51 }, gadget: 90,
    })
    expect(JSON.stringify(entry)).not.toContain('Iron')
  })

  it('resolves a saved entry back to live objects against data', () => {
    const entry = { name: 'X', ship: 1, laserIds: { 0: 10 }, moduleIds: { '0-0': 50 }, gadget: 90 }
    const r = resolveLoadout(entry, data)
    expect(r.shipIndex).toBe(1)
    expect(r.laserIds[0]).toMatchObject({ id: 10 })
    expect(r.moduleIds['0-0']).toMatchObject({ id: 50 })
    expect(r.gadget).toMatchObject({ id: 90 })
  })

  it('drops ids missing from current data (patch drift)', () => {
    const entry = { name: 'X', ship: 0, laserIds: { 0: 999 }, moduleIds: { '0-0': 888 }, gadget: 777 }
    const r = resolveLoadout(entry, data)
    expect(r.laserIds[0]).toBeUndefined()
    expect(r.moduleIds['0-0']).toBeUndefined()
    expect(r.gadget).toBeNull()
  })
})

describe('upsertLoadout / removeLoadout', () => {
  it('appends a new named loadout', () => {
    const out = upsertLoadout([], { name: 'A', ship: 0 })
    expect(out).toHaveLength(1)
  })
  it('replaces an existing loadout with the same name (case-insensitive)', () => {
    const out = upsertLoadout([{ name: 'A', ship: 0 }], { name: 'a', ship: 2 })
    expect(out).toHaveLength(1)
    expect(out[0].ship).toBe(2)
  })
  it('caps the list at MAX_LOADOUTS, dropping the oldest', () => {
    let list = []
    for (let i = 0; i < MAX_LOADOUTS + 3; i++) list = upsertLoadout(list, { name: `L${i}`, ship: 0 })
    expect(list).toHaveLength(MAX_LOADOUTS)
    expect(list[0].name).toBe('L3') // first 3 dropped
  })
  it('removes by name', () => {
    expect(removeLoadout([{ name: 'A' }, { name: 'B' }], 'A')).toEqual([{ name: 'B' }])
  })
})

describe('localStorage adapter', () => {
  beforeEach(() => localStorage.clear())
  it('writes and reads back an array', () => {
    writeLocalLoadouts([{ name: 'A', ship: 1 }])
    expect(readLocalLoadouts()).toEqual([{ name: 'A', ship: 1 }])
    expect(localStorage.getItem(LOCAL_KEY)).toContain('"name":"A"')
  })
  it('returns [] for missing / corrupt storage', () => {
    expect(readLocalLoadouts()).toEqual([])
    localStorage.setItem(LOCAL_KEY, 'not json{')
    expect(readLocalLoadouts()).toEqual([])
  })
})
