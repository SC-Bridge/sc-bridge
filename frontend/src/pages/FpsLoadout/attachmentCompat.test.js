import { describe, it, expect } from 'vitest'
import { isCompatible } from './attachmentCompat'

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
})
