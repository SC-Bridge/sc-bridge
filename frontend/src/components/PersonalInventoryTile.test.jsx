import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PersonalInventoryTile from './PersonalInventoryTile'

// vehicles.vehicle_inventory is the ship's personal inventory capacity in SCU
// (pipeline: InventoryContainer inventoryType.capacity.standardCargoUnits).
describe('PersonalInventoryTile', () => {
  it('shows the stored SCU value as it is (Retaliator: 8)', () => {
    render(<PersonalInventoryTile scu={8} />)
    expect(screen.getByTestId('personal-inventory')).toHaveTextContent('8')
    expect(screen.getByText('Personal inventory')).toBeInTheDocument()
  })

  it('shows large inventories in full (Polaris: 432)', () => {
    render(<PersonalInventoryTile scu={432} />)
    expect(screen.getByTestId('personal-inventory')).toHaveTextContent('432')
  })

  it('keeps up to two decimals (Carrack: 8.92, Avenger Titan: 1.01)', () => {
    const { rerender } = render(<PersonalInventoryTile scu={8.92} />)
    expect(screen.getByTestId('personal-inventory')).toHaveTextContent('8.92')
    rerender(<PersonalInventoryTile scu={1.01} />)
    expect(screen.getByTestId('personal-inventory')).toHaveTextContent('1.01')
  })

  it('renders nothing when the ship has no personal inventory', () => {
    const { container, rerender } = render(<PersonalInventoryTile scu={null} />)
    expect(container.firstChild).toBeNull()
    rerender(<PersonalInventoryTile scu={0} />)
    expect(container.firstChild).toBeNull()
  })
})
