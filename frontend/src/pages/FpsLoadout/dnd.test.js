import { describe, it, expect } from 'vitest'
import { isValidTarget, resolveDrop } from './dnd'

const WEAPON = { uuid: 'w1', base_stats: { item_name: 'FS-9 LMG' } }
const BUILD = { id: 7, weapon_uuid: 'w1', name: 'My FS-9', config: { qualities: { 0: 900 } } }
const OPTIC = { uuid: 'a1', name: 'Delta Reflex', slot: 'optic', attach_port_type: 'IronSight', attach_size: 1 }
const BENCH_WEAPON = {
  base_stats: {
    attachment_ports: [{ port_type: 'IronSight', size_min: 1, size_max: 2 }],
  },
}

describe('isValidTarget', () => {
  it('weapons and builds fit paperdoll weapon slots only', () => {
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'loadout-slot', slotKey: 'primary' })).toBe(true)
    expect(isValidTarget({ kind: 'build', build: BUILD }, { kind: 'loadout-slot', slotKey: 'sidearm' })).toBe(true)
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'loadout-slot', slotKey: 'helmet' })).toBe(false)
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'bench-slot', slot: 'optic' })).toBe(false)
  })

  it('attachments fit their matching bench slot when compatible with the bench weapon', () => {
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'optic' }, BENCH_WEAPON)).toBe(true)
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'barrel' }, BENCH_WEAPON)).toBe(false)
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'primary' }, BENCH_WEAPON)).toBe(false)
    // Incompatible size → rejected.
    const bigOptic = { ...OPTIC, attach_size: 3 }
    expect(isValidTarget({ kind: 'attachment', attachment: bigOptic }, { kind: 'bench-slot', slot: 'optic' }, BENCH_WEAPON)).toBe(false)
  })

  it('handles null drag/target', () => {
    expect(isValidTarget(null, { kind: 'bench-slot', slot: 'optic' })).toBe(false)
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, null)).toBe(false)
  })
})

describe('resolveDrop', () => {
  it('weapon on a weapon slot → equip-weapon', () => {
    expect(resolveDrop({ kind: 'weapon', weapon: WEAPON }, { kind: 'loadout-slot', slotKey: 'primary' }))
      .toEqual({ type: 'equip-weapon', slotKey: 'primary', weapon: WEAPON })
  })
  it('build on a weapon slot → equip-build', () => {
    expect(resolveDrop({ kind: 'build', build: BUILD }, { kind: 'loadout-slot', slotKey: 'secondary' }))
      .toEqual({ type: 'equip-build', slotKey: 'secondary', build: BUILD })
  })
  it('attachment on its bench slot → equip-attachment', () => {
    expect(resolveDrop({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'optic' }, BENCH_WEAPON))
      .toEqual({ type: 'equip-attachment', attachment: OPTIC })
  })
  it('invalid combinations → null', () => {
    expect(resolveDrop({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'primary' }, BENCH_WEAPON)).toBeNull()
    expect(resolveDrop({ kind: 'weapon', weapon: WEAPON }, { kind: 'bench-slot', slot: 'optic' })).toBeNull()
  })

  it('bench combo on a weapon slot → equip-bench-combo', () => {
    expect(resolveDrop({ kind: 'bench-combo' }, { kind: 'loadout-slot', slotKey: 'primary' }))
      .toEqual({ type: 'equip-bench-combo', slotKey: 'primary' })
    expect(resolveDrop({ kind: 'bench-combo' }, { kind: 'loadout-slot', slotKey: 'medical' })).toBeNull()
  })

  it('utility item on its matching slot only → equip-utility', () => {
    const medgun = { uuid: 'u1', name: 'ParaMed Medical Device', util_slot: 'medical' }
    expect(resolveDrop({ kind: 'utility', item: medgun }, { kind: 'loadout-slot', slotKey: 'medical' }))
      .toEqual({ type: 'equip-utility', slotKey: 'medical', item: medgun })
    // Wrong utility slot and weapon slots are rejected.
    expect(resolveDrop({ kind: 'utility', item: medgun }, { kind: 'loadout-slot', slotKey: 'gadget' })).toBeNull()
    expect(resolveDrop({ kind: 'utility', item: medgun }, { kind: 'loadout-slot', slotKey: 'primary' })).toBeNull()
    // Tool attachments (util_slot null) never target a slot.
    const cutter = { uuid: 'u2', name: 'OxyTorch Cutter Attachment', util_slot: null }
    expect(resolveDrop({ kind: 'utility', item: cutter }, { kind: 'loadout-slot', slotKey: 'gadget' })).toBeNull()
  })
})
