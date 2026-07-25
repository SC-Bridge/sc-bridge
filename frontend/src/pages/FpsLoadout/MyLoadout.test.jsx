import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDroppable } from '@dnd-kit/core'
import MyLoadout from './MyLoadout'

// SlotTile's useDroppable `disabled` flag is what actually excludes a tile
// from dnd-kit's live collision detection during a real drag — the pure
// isValidTarget() styling renders correctly regardless of it, so a
// style-only assertion wouldn't catch a tile that's excluded from drops.
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useDroppable: vi.fn(actual.useDroppable) }
})

const ALL_SLOTS = [
  'primary', 'secondary', 'sidearm',
  'helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit',
  'medical', 'gadget', 'throwable',
]

function makeLoadout() {
  return {
    id: 1,
    name: 'Ground Ops',
    slots: [
      { slot_key: 'primary', item_uuid: 'abc', item_name: 'P4-AR Rifle', weapon_build_id: null, owned: true, wishlisted: false, config: { attachments: { barrel: 'stark' } } },
    ],
  }
}

describe('MyLoadout', () => {
  it('renders all 12 slot tiles', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} />)
    for (const slotKey of ALL_SLOTS) {
      expect(screen.getByTestId(`slot-${slotKey}`)).toBeInTheDocument()
    }
  })

  it('shows the filled primary slot with item name, owned tick, and lit barrel pip', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} />)
    const primaryTile = screen.getByTestId('slot-primary')
    expect(screen.getByText('P4-AR Rifle')).toBeInTheDocument()
    expect(screen.getByLabelText('owned')).toBeInTheDocument()

    const barrelPip = screen.getByTestId('pip-primary-barrel')
    expect(barrelPip).toHaveAttribute('data-lit', 'true')
    const opticPip = screen.getByTestId('pip-primary-optic')
    expect(opticPip).toHaveAttribute('data-lit', 'false')
    const underbarrelPip = screen.getByTestId('pip-primary-underbarrel')
    expect(underbarrelPip).toHaveAttribute('data-lit', 'false')

    expect(primaryTile).toContainElement(screen.getByText('P4-AR Rifle'))
  })

  it('shows empty slots with their slot label, not an item name', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} />)
    expect(screen.getByText('Secondary')).toBeInTheDocument()
    expect(screen.getByText('Helmet')).toBeInTheDocument()
  })

  it('calls onSelectSlot with the slot key when a tile is clicked', () => {
    const onSelectSlot = vi.fn()
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={onSelectSlot} />)
    fireEvent.click(screen.getByTestId('slot-primary'))
    expect(onSelectSlot).toHaveBeenCalledWith('primary')
  })

  it('registers armour paperdoll tiles as real dnd-kit drop targets, same as weapon/utility tiles', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} />)
    const disabledFor = (slotKey) => useDroppable.mock.calls.find(([opts]) => opts.id === `loadout-${slotKey}`)[0].disabled
    for (const slotKey of ['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit']) {
      expect(disabledFor(slotKey)).toBe(false)
    }
    // Regression: weapon/utility tiles must stay enabled too.
    expect(disabledFor('primary')).toBe(false)
    expect(disabledFor('medical')).toBe(false)
  })

  it('highlights an armour tile as a valid target when a matching armour item is being dragged', () => {
    const activeDrag = { kind: 'armour', armour: { base_stats: { armour_slot: 'core' } } }
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} activeDrag={activeDrag} dropCtx={{}} />)
    expect(screen.getByTestId('slot-core')).toHaveStyle({ border: '1px solid rgba(0,232,255,0.55)' })
    expect(screen.getByTestId('slot-legs')).not.toHaveStyle({ border: '1px solid rgba(0,232,255,0.55)' })
  })

  it('marks the currently selected slot with selected styling', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot="primary" onSelectSlot={() => {}} />)
    const primaryTile = screen.getByTestId('slot-primary')
    expect(primaryTile).toHaveAttribute('data-selected', 'true')
    expect(primaryTile).toHaveAttribute('aria-pressed', 'true')

    const secondaryTile = screen.getByTestId('slot-secondary')
    expect(secondaryTile).toHaveAttribute('data-selected', 'false')
  })
})
