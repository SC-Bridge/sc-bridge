import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SlotCard from './SlotCard'

// Item slots (CraftingCost_Item) need a count of one specific item, not a cargo
// volume: "5 Hadanite" is five rocks, so it must not read "5 SCU".
describe('SlotCard quantity', () => {
  it('shows an item slot as a count', () => {
    const { container } = render(
      <SlotCard slot={{ name: 'Filter', resource_name: 'Hadanite', slot_type: 'item', quantity: 5 }} />,
    )
    expect(screen.getByText('×5')).toBeTruthy()
    expect(container.textContent).not.toMatch(/SCU/)
  })

  it('keeps resource slots in SCU', () => {
    render(<SlotCard slot={{ name: 'Substrate', resource_name: 'Titanium', slot_type: 'resource', quantity: 2 }} />)
    expect(screen.getByText('2 SCU')).toBeTruthy()
  })
})
