// frontend/src/pages/FpsLoadout/WeaponBenchContainer.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../hooks/useAPI', () => ({
  useCrafting: () => ({ data: {
    blueprints: [{
      name: 'LH86 Pistol', type: 'weapons', sub_type: 'pistol',
      base_stats: { damage: 13, rounds_per_minute: 950, dps: 205.8 },
      slots: [{ name: 'Barrel', resource_name: 'Iron', slot_type: 'resource', modifiers: [
        { key: 'weapon_firerate', start_quality: 0, end_quality: 1000, modifier_at_start: 0.88, modifier_at_end: 1.12 } ] }],
    }],
  }, loading: false, error: null }),
  useFpsGear: () => ({ data: { items: [
    { id: 1, name: 'Stark Compensator 1', category: 'Weapons', sub_category: 'Attachments', sub_type: 'barrel', fire_rate_multiplier: 0.8, uuid: 'stark' },
  ] }, loading: false, error: null }),
}))

import WeaponBenchContainer from './WeaponBenchContainer'

describe('WeaponBenchContainer', () => {
  it('lists weapon blueprints and renders the bench for the chosen one', () => {
    render(<WeaponBenchContainer />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    // 'LH86 Pistol' renders twice (the <option> and the bench <h3>), so assert the option by role.
    expect(screen.getByRole('option', { name: 'LH86 Pistol' })).toBeInTheDocument()
    expect(screen.getByText('Damage')).toBeInTheDocument()
  })
})
