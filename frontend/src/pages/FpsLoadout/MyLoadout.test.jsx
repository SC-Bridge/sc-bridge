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

const FIXED_SLOTS = ['primary', 'secondary', 'sidearm', 'helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit']
// Heavy core + legs equipped — full capacity across every dynamic family.
const FULL_CAPACITY = { grenades: 4, mags: 8, pens: 4, utilGadget: 1, utilKnife: 1 }
const NO_CAPACITY = { grenades: 0, mags: 0, pens: 0, utilGadget: 0, utilKnife: 0 }

function makeLoadout(slots = []) {
  return {
    id: 1,
    name: 'Ground Ops',
    slots: [
      { slot_key: 'primary', item_uuid: 'abc', item_name: 'P4-AR Rifle', weapon_build_id: null, owned: true, wishlisted: false, config: { attachments: { barrel: 'stark' } } },
      ...slots,
    ],
  }
}

describe('MyLoadout', () => {
  it('renders the 9 fixed paperdoll tiles', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} />)
    for (const slotKey of FIXED_SLOTS) {
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

  it('registers armour and utility paperdoll tiles as real dnd-kit drop targets, same as weapon tiles', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={FULL_CAPACITY} />)
    const disabledFor = (slotKey) => useDroppable.mock.calls.find(([opts]) => opts.id === `loadout-${slotKey}`)[0].disabled
    for (const slotKey of ['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit']) {
      expect(disabledFor(slotKey)).toBe(false)
    }
    // Regression: weapon/utility tiles must stay enabled too.
    expect(disabledFor('primary')).toBe(false)
    expect(disabledFor('pen_1')).toBe(false)
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

  describe('dynamic utility groups (slice 3)', () => {
    it('renders one tile per family slot, sized by the capacity prop', () => {
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={FULL_CAPACITY} />)
      for (let i = 1; i <= 4; i++) expect(screen.getByTestId(`slot-grenade_${i}`)).toBeInTheDocument()
      for (let i = 1; i <= 8; i++) expect(screen.getByTestId(`slot-mag_${i}`)).toBeInTheDocument()
      for (let i = 1; i <= 4; i++) expect(screen.getByTestId(`slot-pen_${i}`)).toBeInTheDocument()
      expect(screen.getByTestId('slot-util_gadget')).toBeInTheDocument()
      expect(screen.getByTestId('slot-util_knife')).toBeInTheDocument()
    })

    // Pin: no Slings group is ever rendered, at full or empty capacity — the
    // family, its icon, and its tiles were removed entirely (slings removed).
    it('never renders a Slings group, at full or empty capacity (slings removed)', () => {
      const { unmount } = render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={FULL_CAPACITY} />)
      expect(screen.queryByText('Slings')).not.toBeInTheDocument()
      expect(screen.queryByTestId('group-hint-slings')).not.toBeInTheDocument()
      expect(screen.queryByTestId('slot-sling_1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('slot-sling_2')).not.toBeInTheDocument()
      unmount()
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={NO_CAPACITY} />)
      expect(screen.queryByText('Slings')).not.toBeInTheDocument()
      expect(screen.queryByTestId('group-hint-slings')).not.toBeInTheDocument()
    })

    // The paperdoll renders exactly six groups (2 fixed + 4 dynamic) at every
    // capacity — a fixed, closed set with no extra group ever appearing.
    it('renders exactly the six paperdoll groups and no more, at full or empty capacity', () => {
      const GROUP_LABELS = ['Weapons', 'Armour', 'Grenades', 'Pens', 'Utility', 'Mags']
      const { unmount } = render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={FULL_CAPACITY} />)
      for (const label of GROUP_LABELS) expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getAllByText(new RegExp(`^(${GROUP_LABELS.join('|')})$`))).toHaveLength(GROUP_LABELS.length)
      unmount()
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={NO_CAPACITY} />)
      for (const label of GROUP_LABELS) expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getAllByText(new RegExp(`^(${GROUP_LABELS.join('|')})$`))).toHaveLength(GROUP_LABELS.length)
    })

    it('greys grenade/mag groups with a "needs core armour" hint when no core is equipped', () => {
      const capacity = { ...NO_CAPACITY, pens: 4, utilGadget: 1, utilKnife: 1 } // legs but no core
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={capacity} />)
      for (const family of ['grenades', 'mags']) {
        expect(screen.getByTestId(`group-hint-${family}`)).toHaveTextContent('needs core armour')
      }
      expect(screen.queryByTestId('slot-grenade_1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('slot-mag_1')).not.toBeInTheDocument()
      // Legs-driven groups stay unaffected.
      expect(screen.getByTestId('slot-pen_1')).toBeInTheDocument()
      expect(screen.getByTestId('slot-util_gadget')).toBeInTheDocument()
    })

    it('greys the pens/utility groups with a "needs leg armour" hint when no legs are equipped', () => {
      const capacity = { grenades: 2, mags: 4, pens: 0, utilGadget: 0, utilKnife: 0 } // core but no legs
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={capacity} />)
      expect(screen.getByTestId('group-hint-pens')).toHaveTextContent('needs leg armour')
      expect(screen.getByTestId('group-hint-utility')).toHaveTextContent('needs leg armour')
      expect(screen.queryByTestId('slot-pen_1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('slot-util_gadget')).not.toBeInTheDocument()
      // Core-driven groups stay unaffected.
      expect(screen.getByTestId('slot-grenade_1')).toBeInTheDocument()
    })

    it('never deletes a filled tile whose slot outgrew a shrunk capacity — it renders as overflow instead', () => {
      const loadout = makeLoadout([
        { slot_key: 'grenade_3', item_uuid: 'g3', item_name: 'MK-4 Frag Grenade', config: null },
      ])
      // Shrunk to a light core (capacity 2) after grenade_3 was equipped under a heavier core.
      render(<MyLoadout loadout={loadout} selectedSlot={null} onSelectSlot={() => {}} capacity={{ ...NO_CAPACITY, grenades: 2 }} />)
      expect(screen.getByTestId('slot-grenade_1')).toBeInTheDocument()
      expect(screen.getByTestId('slot-grenade_2')).toBeInTheDocument()
      const overflowTile = screen.getByTestId('slot-grenade_3')
      expect(overflowTile).toHaveAttribute('data-overflow', 'true')
      // Still clickable.
      const onSelectSlot = vi.fn()
      render(<MyLoadout loadout={loadout} selectedSlot={null} onSelectSlot={onSelectSlot} capacity={{ ...NO_CAPACITY, grenades: 2 }} />)
      fireEvent.click(screen.getAllByTestId('slot-grenade_3')[1])
      expect(onSelectSlot).toHaveBeenCalledWith('grenade_3')
    })

    it('does not mark in-capacity tiles as overflow', () => {
      render(<MyLoadout loadout={makeLoadout()} selectedSlot={null} onSelectSlot={() => {}} capacity={FULL_CAPACITY} />)
      expect(screen.getByTestId('slot-grenade_1')).toHaveAttribute('data-overflow', 'false')
    })
  })
})
