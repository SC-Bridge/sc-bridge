import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MyLoadout from './MyLoadout'

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

  it('marks the currently selected slot with selected styling', () => {
    render(<MyLoadout loadout={makeLoadout()} selectedSlot="primary" onSelectSlot={() => {}} />)
    const primaryTile = screen.getByTestId('slot-primary')
    expect(primaryTile).toHaveAttribute('data-selected', 'true')
    expect(primaryTile).toHaveAttribute('aria-pressed', 'true')

    const secondaryTile = screen.getByTestId('slot-secondary')
    expect(secondaryTile).toHaveAttribute('data-selected', 'false')
  })
})
