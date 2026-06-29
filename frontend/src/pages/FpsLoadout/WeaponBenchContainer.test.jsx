// frontend/src/pages/FpsLoadout/WeaponBenchContainer.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../hooks/useAPI', () => ({
  useCrafting: () => ({ data: { blueprints: [{
    uuid: 'lh86', name: 'LH86 Pistol', type: 'weapons', sub_type: 'pistol',
    base_stats: { damage: 13, rounds_per_minute: 950, dps: 205.8 },
    slots: [{ name: 'Barrel', resource_name: 'Iron', slot_type: 'resource', modifiers: [
      { key: 'weapon_firerate', start_quality: 0, end_quality: 1000, modifier_at_start: 0.88, modifier_at_end: 1.12 } ] }],
  }] }, loading: false, error: null }),
  useWeaponBench: () => ({ data: { attachments: [
    { uuid: 'stark', name: 'Stark Compensator 1', sub_type: 'barrel', fire_rate_multiplier: 0.8 },
  ] }, loading: false, error: null }),
  useWeaponBuilds: () => ({ data: { items: [
    { id: 1, name: 'Saved A', weapon_uuid: 'lh86', config: { qualities: { 0: 250 }, attachments: {} } },
    { id: 2, name: 'Ghost', weapon_uuid: 'nope', config: { qualities: { 0: 1000 }, attachments: {} } },
  ] }, loading: false, error: null, refetch: vi.fn() }),
  createWeaponBuild: vi.fn(() => Promise.resolve({})),
  deleteWeaponBuild: vi.fn(() => Promise.resolve({})),
}))

import WeaponBenchContainer from './WeaponBenchContainer'

describe('WeaponBenchContainer', () => {
  it('lists weapon blueprints and renders the bench for the chosen one', () => {
    render(<WeaponBenchContainer />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    // 'LH86 Pistol' renders twice (the <option> and the bench <h3>), so assert the option by role.
    expect(screen.getByRole('option', { name: 'LH86 Pistol' })).toBeInTheDocument()
    expect(screen.getByText('Damage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stark Compensator 1/ })).toBeInTheDocument()
  })

  it('loads a saved build for an available weapon (its sliders then warn on change)', () => {
    render(<WeaponBenchContainer />)
    expect(screen.getByText('Saved A')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^Load$/ })[0]) // Saved A → weapon lh86
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '1000' } })
    expect(screen.getByText(/no longer match your saved weapon/i)).toBeInTheDocument()
  })

  it('ignores Load for a build whose weapon is unavailable (guard)', () => {
    render(<WeaponBenchContainer />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Load$/ })[1]) // Ghost → weapon_uuid 'nope'
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '1000' } })
    expect(screen.queryByText(/no longer match/i)).not.toBeInTheDocument()
  })
})
