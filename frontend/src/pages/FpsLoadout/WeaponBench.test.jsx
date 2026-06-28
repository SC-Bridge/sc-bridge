// frontend/src/pages/FpsLoadout/WeaponBench.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import WeaponBench from './WeaponBench'

const BLUEPRINT = {
  name: 'LH86 Pistol',
  base_stats: { damage: 13, rounds_per_minute: 950, dps: 205.8, effective_range: 20, ammo_capacity: 25 },
  slots: [
    { name: 'Frame', resource_name: 'Aluminum', slot_type: 'resource', modifiers: [
      { key: 'weapon_recoil_kick', start_quality: 0, end_quality: 1000, modifier_at_start: 1.2, modifier_at_end: 0.8 } ] },
    { name: 'Barrel', resource_name: 'Iron', slot_type: 'resource', modifiers: [
      { key: 'weapon_firerate', start_quality: 0, end_quality: 1000, modifier_at_start: 0.88, modifier_at_end: 1.12 } ] },
  ],
}
const ATTACHMENTS = [
  { uuid: 'stark', name: 'Stark Compensator 1', slot: 'barrel', fire_rate_multiplier: 0.8 },
]

describe('WeaponBench', () => {
  it('renders the weapon, a slider per material slot, and a stats panel', () => {
    render(<WeaponBench blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    expect(screen.getByText('LH86 Pistol')).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)      // Frame + Barrel
    expect(screen.getByText('Damage')).toBeInTheDocument()
  })

  it('recomputes fire rate when an attachment is equipped', () => {
    render(<WeaponBench blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    // At default Q500 the firerate curve interpolates to ×1.0, so build rpm = base (950).
    // Equipping the Stark Compensator (−20%) drops build rpm to 760 (unique in the DOM).
    fireEvent.click(screen.getByRole('button', { name: /Stark Compensator 1/ }))
    expect(screen.getByText('760')).toBeInTheDocument()
  })

  it('shows a placeholder banner when no blueprint', () => {
    render(<WeaponBench blueprint={null} attachments={[]} />)
    expect(screen.getByText(/select a weapon/i)).toBeInTheDocument()
  })
})
