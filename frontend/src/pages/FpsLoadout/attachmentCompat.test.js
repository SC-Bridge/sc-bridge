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
})
