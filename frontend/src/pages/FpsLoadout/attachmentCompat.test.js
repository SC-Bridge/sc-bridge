import { describe, it, expect } from 'vitest'
import { isCompatible, attachmentSlot, weaponAttachmentSlots } from './attachmentCompat'

// Real FS-9 LMG ports (as served at base_stats.attachment_ports).
const FS9 = {
  base_stats: {
    attachment_ports: [
      { port_type: 'Magazine', size_min: 1, size_max: 1, required_port_tags: 'behr_lmg_ballistic_01' },
      { port_type: 'IronSight', size_min: 1, size_max: 2, required_port_tags: null },
      { port_type: 'Barrel', size_min: 2, size_max: 2, required_port_tags: 'FPS_Barrel ballistic_attach' },
      { port_type: 'BottomAttachment', size_min: 1, size_max: 3, required_port_tags: null },
    ],
  },
}

describe('attachmentSlot', () => {
  it('maps real port types to the three modelled slots', () => {
    expect(attachmentSlot({ attach_port_type: 'IronSight' })).toBe('optic')
    expect(attachmentSlot({ attach_port_type: 'Barrel' })).toBe('barrel')
    expect(attachmentSlot({ attach_port_type: 'BottomAttachment' })).toBe('underbarrel')
  })
  it('returns null for unmodelled port types (magazine/utility/missile)', () => {
    expect(attachmentSlot({ attach_port_type: 'Magazine' })).toBeNull()
    expect(attachmentSlot({ attach_port_type: 'Utility' })).toBeNull()
  })
})

describe('weaponAttachmentSlots', () => {
  it('derives the FS-9 slots (optic/barrel/underbarrel) from base_stats ports, excluding magazine', () => {
    expect(weaponAttachmentSlots(FS9)).toEqual(['optic', 'barrel', 'underbarrel'])
  })
  it('falls back to the attachments’ own slots when the weapon has no port data', () => {
    expect(weaponAttachmentSlots({ name: 'x' }, [{ slot: 'barrel' }])).toEqual(['barrel'])
  })
})

describe('isCompatible', () => {
  it('is permissive when no port data is present (current state)', () => {
    expect(isCompatible({ name: 'LH86' }, { name: 'Scope' })).toBe(true)
  })
  it('enforces port type + size when port data exists', () => {
    const weapon = { attachment_ports: [{ port_type: 'optic', size_min: 1, size_max: 2 }] }
    expect(isCompatible(weapon, { attach_port_type: 'optic', attach_size: 1 })).toBe(true)
    expect(isCompatible(weapon, { attach_port_type: 'optic', attach_size: 3 })).toBe(false)  // too big
    expect(isCompatible(weapon, { attach_port_type: 'barrel', attach_size: 1 })).toBe(false) // wrong type
  })

  it('enforces required_port_tags ⊆ attachment tags', () => {
    const weapon = { attachment_ports: [{ port_type: 'Barrel', size_min: 1, size_max: 2, required_port_tags: 'ballistic_attach' }] }
    // all required tags present → fits
    expect(isCompatible(weapon, { attach_port_type: 'Barrel', attach_size: 1, attach_tags: 'FPS_Barrel ballistic_attach' })).toBe(true)
    // required tag missing → rejected even though type + size match
    expect(isCompatible(weapon, { attach_port_type: 'Barrel', attach_size: 1, attach_tags: 'FPS_Barrel' })).toBe(false)
    // a port with no required tags accepts on type + size alone
    const loose = { attachment_ports: [{ port_type: 'Barrel', size_min: 1, size_max: 2 }] }
    expect(isCompatible(loose, { attach_port_type: 'Barrel', attach_size: 1 })).toBe(true)
  })

  it('reads ports from base_stats.attachment_ports (real crafting-blueprint shape)', () => {
    // FS-9 IronSight port accepts size 1-2 with no required tags.
    expect(isCompatible(FS9, { attach_port_type: 'IronSight', attach_size: 1 })).toBe(true)
    // FS-9 Barrel port needs both FPS_Barrel + ballistic_attach and size exactly 2.
    expect(isCompatible(FS9, { attach_port_type: 'Barrel', attach_size: 2, attach_tags: 'FPS_Barrel ballistic_attach' })).toBe(true)
    expect(isCompatible(FS9, { attach_port_type: 'Barrel', attach_size: 1, attach_tags: 'FPS_Barrel ballistic_attach' })).toBe(false) // wrong size
    // A sniper magazine (wrong required tag) doesn't fit the FS-9's magazine port.
    expect(isCompatible(FS9, { attach_port_type: 'Magazine', attach_size: 1, attach_tags: 'gmni_sniper_ballistic_01' })).toBe(false)
  })
})
