import { describe, it, expect } from 'vitest'
import { isValidTarget, resolveDrop, resolveDropFromCollisions, mergeAttachmentIntoConfig } from './dnd'

const WEAPON = { uuid: 'w1', base_stats: { item_name: 'FS-9 LMG' } }
const BUILD = { id: 7, weapon_uuid: 'w1', name: 'My FS-9', config: { qualities: { 0: 900 } } }
const OPTIC = { uuid: 'a1', name: 'Delta Reflex', slot: 'optic', attach_port_type: 'IronSight', attach_size: 1 }
const BENCH_WEAPON = {
  base_stats: {
    attachment_ports: [{ port_type: 'IronSight', size_min: 1, size_max: 2 }],
  },
}
// A pistol that only takes size-1 optics (the "16x can't go on an LH86" case).
const PISTOL = {
  base_stats: {
    attachment_ports: [{ port_type: 'IronSight', size_min: 1, size_max: 1 }],
  },
}

describe('isValidTarget', () => {
  it('weapons and builds fit paperdoll weapon slots only', () => {
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'loadout-slot', slotKey: 'primary' })).toBe(true)
    expect(isValidTarget({ kind: 'build', build: BUILD }, { kind: 'loadout-slot', slotKey: 'sidearm' })).toBe(true)
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'loadout-slot', slotKey: 'helmet' })).toBe(false)
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'bench-slot', slot: 'optic' })).toBe(false)
  })

  it('weapons and builds fit the bench (load-to-preview); attachments/utility do not', () => {
    expect(isValidTarget({ kind: 'weapon', weapon: WEAPON }, { kind: 'bench' })).toBe(true)
    expect(isValidTarget({ kind: 'build', build: BUILD }, { kind: 'bench' })).toBe(true)
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench' })).toBe(false)
    expect(isValidTarget({ kind: 'utility', item: { util_slot: 'medical' } }, { kind: 'bench' })).toBe(false)
  })

  it('attachments fit their matching bench slot when compatible with the bench weapon', () => {
    const ctx = { benchWeapon: BENCH_WEAPON }
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'optic' }, ctx)).toBe(true)
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'barrel' }, ctx)).toBe(false)
    // Incompatible size → rejected.
    const bigOptic = { ...OPTIC, attach_size: 3 }
    expect(isValidTarget({ kind: 'attachment', attachment: bigOptic }, { kind: 'bench-slot', slot: 'optic' }, ctx)).toBe(false)
  })

  it('attachments fit a FILLED loadout weapon tile only when compatible with THAT slot weapon', () => {
    const ctx = { slotWeapons: { primary: BENCH_WEAPON, sidearm: PISTOL } }
    // Size-1 optic fits both the primary and the pistol sidearm.
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'primary' }, ctx)).toBe(true)
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'sidearm' }, ctx)).toBe(true)
    // Size-2 16x-style optic fits the primary but NOT the pistol.
    const scope = { ...OPTIC, attach_size: 2 }
    expect(isValidTarget({ kind: 'attachment', attachment: scope }, { kind: 'loadout-slot', slotKey: 'primary' }, ctx)).toBe(true)
    expect(isValidTarget({ kind: 'attachment', attachment: scope }, { kind: 'loadout-slot', slotKey: 'sidearm' }, ctx)).toBe(false)
    // Empty slot (no saved weapon) never accepts an attachment.
    expect(isValidTarget({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'secondary' }, ctx)).toBe(false)
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
    expect(resolveDrop({ kind: 'attachment', attachment: OPTIC }, { kind: 'bench-slot', slot: 'optic' }, { benchWeapon: BENCH_WEAPON }))
      .toEqual({ type: 'equip-attachment', attachment: OPTIC })
  })
  it('attachment on a filled loadout tile → equip-attachment-to-slot', () => {
    const ctx = { slotWeapons: { primary: BENCH_WEAPON } }
    expect(resolveDrop({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'primary' }, ctx))
      .toEqual({ type: 'equip-attachment-to-slot', slotKey: 'primary', attachment: OPTIC })
  })
  it('weapon or build on the bench → load-bench (preview only)', () => {
    expect(resolveDrop({ kind: 'weapon', weapon: WEAPON }, { kind: 'bench' }))
      .toEqual({ type: 'load-bench', weapon: WEAPON })
    expect(resolveDrop({ kind: 'build', build: BUILD }, { kind: 'bench' }))
      .toEqual({ type: 'load-bench', build: BUILD })
  })
  it('invalid combinations → null', () => {
    expect(resolveDrop({ kind: 'attachment', attachment: OPTIC }, { kind: 'loadout-slot', slotKey: 'primary' }, { benchWeapon: BENCH_WEAPON })).toBeNull()
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

describe('armour drags', () => {
  const core = { kind: 'armour', armour: { uuid: 'a1', base_stats: { armour_slot: 'core' } } }
  it('valid only on the matching armour slot tile', () => {
    expect(isValidTarget(core, { kind: 'loadout-slot', slotKey: 'core' })).toBe(true)
    expect(isValidTarget(core, { kind: 'loadout-slot', slotKey: 'legs' })).toBe(false)
    expect(isValidTarget(core, { kind: 'loadout-slot', slotKey: 'primary' })).toBe(false)
  })
  it('valid on the bench (load-to-preview)', () => {
    expect(isValidTarget(core, { kind: 'bench' })).toBe(true)
  })
  it('resolves to equip-armour / load-bench actions', () => {
    expect(resolveDrop(core, { kind: 'loadout-slot', slotKey: 'core' }))
      .toEqual({ type: 'equip-armour', slotKey: 'core', armour: core.armour })
    expect(resolveDrop(core, { kind: 'bench' })).toEqual({ type: 'load-bench', armour: core.armour })
  })
  it('armour builds land on their armour_slot too', () => {
    const build = { kind: 'build', build: { id: 9, kind: 'armour', item_uuid: 'a1', armourSlot: 'core' } }
    expect(isValidTarget(build, { kind: 'loadout-slot', slotKey: 'core' })).toBe(true)
    expect(isValidTarget(build, { kind: 'loadout-slot', slotKey: 'sidearm' })).toBe(false)
  })
  it('armour bench-combo lands only on its armour_slot tile', () => {
    const ctx = { benchKind: 'armour', benchWeapon: { base_stats: { armour_slot: 'core' } } }
    expect(isValidTarget({ kind: 'bench-combo' }, { kind: 'loadout-slot', slotKey: 'core' }, ctx)).toBe(true)
    expect(isValidTarget({ kind: 'bench-combo' }, { kind: 'loadout-slot', slotKey: 'legs' }, ctx)).toBe(false)
  })
})

describe('resolveDropFromCollisions', () => {
  const collision = (data) => ({ data: { droppableContainer: { data: { current: data } } } })

  it('skips an invalid top collision and resolves the valid one underneath', () => {
    // An attachment dropped on a bench-slot zone that's INSIDE the bench
    // panel: the outer bench container is an invalid target for attachments,
    // but the zone below it is valid.
    const collisions = [
      collision({ kind: 'bench' }),
      collision({ kind: 'bench-slot', slot: 'optic' }),
    ]
    expect(resolveDropFromCollisions({ kind: 'attachment', attachment: OPTIC }, collisions, { benchWeapon: BENCH_WEAPON }))
      .toEqual({ type: 'equip-attachment', attachment: OPTIC })
  })

  it('returns null when no collision is a valid combination', () => {
    expect(resolveDropFromCollisions({ kind: 'attachment', attachment: OPTIC }, [collision({ kind: 'bench' })], {})).toBeNull()
    expect(resolveDropFromCollisions({ kind: 'weapon', weapon: WEAPON }, [], {})).toBeNull()
    expect(resolveDropFromCollisions({ kind: 'weapon', weapon: WEAPON }, undefined, {})).toBeNull()
  })
})

describe('mergeAttachmentIntoConfig', () => {
  it('adds the attachment to its slot, preserving qualities and other attachments', () => {
    const config = { qualities: { 0: 900 }, attachments: { barrel: 'b1' } }
    expect(mergeAttachmentIntoConfig(config, OPTIC)).toEqual({
      qualities: { 0: 900 },
      attachments: { barrel: 'b1', optic: 'a1' },
    })
    // Original untouched (immutably merged).
    expect(config.attachments).toEqual({ barrel: 'b1' })
  })
  it('handles a null/empty config', () => {
    expect(mergeAttachmentIntoConfig(null, OPTIC)).toEqual({ qualities: {}, attachments: { optic: 'a1' } })
  })
  it('replaces an existing attachment in the same slot', () => {
    const config = { qualities: {}, attachments: { optic: 'old' } }
    expect(mergeAttachmentIntoConfig(config, OPTIC).attachments).toEqual({ optic: 'a1' })
  })
})
