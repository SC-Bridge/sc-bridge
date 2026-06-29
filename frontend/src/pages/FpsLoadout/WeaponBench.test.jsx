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

const BLUEPRINT_2 = {
  name: 'P4-AR Rifle',
  base_stats: { damage: 22, rounds_per_minute: 600, dps: 220, effective_range: 50, ammo_capacity: 30 },
  slots: [
    { name: 'Receiver', resource_name: 'Titanium', slot_type: 'resource', modifiers: [] },
  ],
}

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

  it('resets qualities and equipped state when the weapon blueprint changes', () => {
    // BLUEPRINT has 2 slots; BLUEPRINT_2 has 1 slot.
    // After rerender with BLUEPRINT_2 the old equipped attachments must be cleared ({}).
    // We verify this by equipping Stark Compensator on BLUEPRINT (rpm drops from 950→760),
    // then switching to BLUEPRINT_2 and asserting its base rpm (600) is the build value —
    // if equipped was NOT reset, Stark's ×0.8 would make it 480 instead.
    const { rerender } = render(<WeaponBench blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    // Equip the attachment on the first weapon; build rpm drops to 760
    fireEvent.click(screen.getByRole('button', { name: /Stark Compensator 1/ }))
    expect(screen.getByText('760')).toBeInTheDocument()

    // Switch to a different weapon (2 slots → 1 slot)
    rerender(<WeaponBench blueprint={BLUEPRINT_2} attachments={ATTACHMENTS} />)

    // The slider count must match the new weapon's slot count
    expect(screen.getAllByRole('slider')).toHaveLength(1)

    // If equipped was NOT reset, Stark Compensator would still be active →
    // build rpm = 600 × 0.8 = 480. A correct reset means no 480 in the DOM.
    expect(screen.queryByText('480')).not.toBeInTheDocument()
  })

  it('renders the real weapon icon image when base_stats.loadout_icon is present', () => {
    const bp = { ...BLUEPRINT, base_stats: { ...BLUEPRINT.base_stats, loadout_icon: 'https://imagedelivery.net/x/lh86/public' } }
    render(<WeaponBench blueprint={bp} attachments={[]} />)
    const img = screen.getByRole('img', { name: bp.name })
    expect(img).toHaveAttribute('src', 'https://imagedelivery.net/x/lh86/public')
  })

  it('equips an attachment by dragging it onto its slot drop-zone', () => {
    render(<WeaponBench blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    const zone = screen.getByTestId('dropzone-barrel')
    const card = screen.getByTestId('att-stark')
    const dt = { getData: () => 'stark', setData: () => {} }
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.drop(zone, { dataTransfer: dt })
    expect(within(zone).getByText(/Stark Compensator 1/)).toBeInTheDocument()
  })

  it('warns when a loaded build’s slider is moved off its saved baseline', () => {
    render(<WeaponBench blueprint={BLUEPRINT} attachments={[]} initialConfig={{ qualities: { 0: 250, 1: 250 }, attachments: {}, name: 'My Rifle' }} />)
    expect(screen.queryByText(/no longer match/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '1000' } })
    expect(screen.getByText(/no longer match your saved weapon/i)).toBeInTheDocument()
    expect(screen.getByText(/My Rifle/)).toBeInTheDocument()
  })
})
