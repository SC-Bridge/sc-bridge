// frontend/src/pages/FpsLoadout/ItemBench.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ItemBench from './ItemBench'

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

// Same fixture family as Task 5's benchAdapters.test.js.
const ARMOUR_BP = {
  slots: [{ name: 'Padding', resource_name: 'Synthetic Fiber', slot_type: 'resource', modifiers: [
    { key: 'armor_damagemitigation', start_quality: 0, end_quality: 1000, modifier_at_start: 0.9, modifier_at_end: 1.2 } ] }],
  base_stats: { resist_physical: 0.2, temperature_min: -80, temperature_max: 120, weight: 12.5, armour_slot: 'core' },
}

// Attachments drag from Item Source via dnd-kit; the DndContext lives in
// LoadoutContainer, which resolves the drop and signals the bench through a
// seq-bumped equipRequest prop. Tests simulate a completed drop the same way.
let equipSeq = 0
function equipViaRequest(rerender, props, uuid) {
  equipSeq += 1
  rerender(<ItemBench {...props} equipRequest={{ uuid, seq: equipSeq }} />)
}

describe('ItemBench', () => {
  it('renders the weapon, a slider per material slot, and a stats panel', () => {
    render(<ItemBench kind="weapon" blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    expect(screen.getByText('LH86 Pistol')).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)      // Frame + Barrel
    expect(screen.getByText('Damage')).toBeInTheDocument()
  })

  // FIX 2: attachments no longer live under the bench as a flat chip list —
  // they're picked from Item Source's Attach tab and dragged onto a dropzone.
  it('does not render the old attachment chip list, but a dropzone still renders', () => {
    render(<ItemBench kind="weapon" blueprint={BLUEPRINT} attachments={ATTACHMENTS} />)
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stark Compensator 1/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('dropzone-barrel')).toBeInTheDocument()
  })

  it('recomputes fire rate when an attachment is dropped onto its slot', () => {
    const props = { kind: 'weapon', blueprint: BLUEPRINT, attachments: ATTACHMENTS }
    const { rerender } = render(<ItemBench {...props} />)
    // At default Q500 the firerate curve interpolates to ×1.0, so build rpm = base (950).
    // Equipping the Stark Compensator (−20%) drops build rpm to 760 (unique in the DOM).
    equipViaRequest(rerender, props, 'stark')
    expect(screen.getByText('760')).toBeInTheDocument()
  })

  it('renders one drop-zone per attachment slot the weapon exposes (from its ports)', () => {
    const ported = {
      ...BLUEPRINT,
      base_stats: {
        ...BLUEPRINT.base_stats,
        attachment_ports: [
          { port_type: 'Magazine', size_min: 1, size_max: 1 },   // not a modelled slot
          { port_type: 'IronSight', size_min: 1, size_max: 2 },
          { port_type: 'Barrel', size_min: 2, size_max: 2 },
          { port_type: 'BottomAttachment', size_min: 1, size_max: 3 },
        ],
      },
    }
    render(<ItemBench kind="weapon" blueprint={ported} attachments={[]} />)
    expect(screen.getByTestId('dropzone-optic')).toBeInTheDocument()
    expect(screen.getByTestId('dropzone-barrel')).toBeInTheDocument()
    expect(screen.getByTestId('dropzone-underbarrel')).toBeInTheDocument()
    // Magazine is not one of the three modelled slots.
    expect(screen.queryByTestId('dropzone-magazine')).not.toBeInTheDocument()
  })

  it('shows a placeholder banner when no blueprint', () => {
    render(<ItemBench kind="weapon" blueprint={null} attachments={[]} />)
    expect(screen.getByText(/select a weapon/i)).toBeInTheDocument()
  })

  it('resets qualities and equipped state when the weapon blueprint changes', () => {
    // BLUEPRINT has 2 slots; BLUEPRINT_2 has 1 slot.
    // After rerender with BLUEPRINT_2 the old equipped attachments must be cleared ({}).
    // We verify this by equipping Stark Compensator on BLUEPRINT (rpm drops from 950→760),
    // then switching to BLUEPRINT_2 and asserting its base rpm (600) is the build value —
    // if equipped was NOT reset, Stark's ×0.8 would make it 480 instead.
    const props = { kind: 'weapon', blueprint: BLUEPRINT, attachments: ATTACHMENTS }
    const { rerender } = render(<ItemBench {...props} />)
    // Equip the attachment on the first weapon; build rpm drops to 760
    equipViaRequest(rerender, props, 'stark')
    expect(screen.getByText('760')).toBeInTheDocument()

    // Switch to a different weapon (2 slots → 1 slot)
    rerender(<ItemBench kind="weapon" blueprint={BLUEPRINT_2} attachments={ATTACHMENTS} />)

    // The slider count must match the new weapon's slot count
    expect(screen.getAllByRole('slider')).toHaveLength(1)

    // If equipped was NOT reset, Stark Compensator would still be active →
    // build rpm = 600 × 0.8 = 480. A correct reset means no 480 in the DOM.
    expect(screen.queryByText('480')).not.toBeInTheDocument()
  })

  it('renders the real weapon icon image when base_stats.loadout_icon is present', () => {
    const bp = { ...BLUEPRINT, base_stats: { ...BLUEPRINT.base_stats, loadout_icon: 'https://imagedelivery.net/x/lh86/public' } }
    render(<ItemBench kind="weapon" blueprint={bp} attachments={[]} />)
    const img = screen.getByRole('img', { name: bp.name })
    expect(img).toHaveAttribute('src', 'https://imagedelivery.net/x/lh86/public')
  })

  it('shows the equipped attachment in its slot drop-zone after a drop', () => {
    const props = { kind: 'weapon', blueprint: BLUEPRINT, attachments: ATTACHMENTS }
    const { rerender } = render(<ItemBench {...props} />)
    equipViaRequest(rerender, props, 'stark')
    const zone = screen.getByTestId('dropzone-barrel')
    expect(within(zone).getByText(/Stark Compensator 1/)).toBeInTheDocument()
  })

  it('ignores an equip request for an attachment that does not fit the weapon', () => {
    // An optic attachment can't land in the barrel slot state — the request
    // carries a uuid whose slot is optic, and there's no optic among ATTACHMENTS.
    const atts = [...ATTACHMENTS, { uuid: 'wrongslot', name: 'Fake Optic', slot: null }]
    const props = { kind: 'weapon', blueprint: BLUEPRINT, attachments: atts }
    const { rerender } = render(<ItemBench {...props} />)
    equipViaRequest(rerender, props, 'wrongslot')
    // Nothing equipped: rpm stays at base 950.
    expect(screen.getByText('950')).toBeInTheDocument()
  })

  it('warns when a loaded build’s slider is moved off its saved baseline', () => {
    render(<ItemBench kind="weapon" blueprint={BLUEPRINT} attachments={[]} initialConfig={{ qualities: { 0: 250, 1: 250 }, attachments: {}, name: 'My Rifle' }} />)
    expect(screen.queryByText(/no longer match/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '1000' } })
    expect(screen.getByText(/no longer match your saved weapon/i)).toBeInTheDocument()
    expect(screen.getByText(/My Rifle/)).toBeInTheDocument()
  })

  it('renders armour without attachment slots or drop zones', () => {
    render(<ItemBench kind="armour" blueprint={ARMOUR_BP} attachments={[]} />)
    expect(screen.queryByTestId(/dropzone-/)).toBeNull()
    expect(screen.getByTestId('armour-stats-grid')).toBeInTheDocument()
  })

  it('moves armour resist stats when a quality slider moves', () => {
    render(<ItemBench kind="armour" blueprint={ARMOUR_BP} attachments={[]} />)
    // At default Q500 the damagemitigation curve interpolates to ×1.05, so
    // physical resist reads 21% (0.2 × 1.05).
    expect(screen.getByText('21%')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1000' } })
    // At Q1000 the multiplier is ×1.2 (modifier_at_end) → 24%.
    expect(screen.getByText('24%')).toBeInTheDocument()
    expect(screen.queryByText('21%')).not.toBeInTheDocument()
  })
})
