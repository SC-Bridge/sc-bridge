import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CargoInline, CargoTile } from './ModularCargo'

const retaliator = [
  { uuid: 'f-base', port_name: 'hardpoint_front_module', is_default: 1, cargo: null },
  { uuid: 'f-cargo', port_name: 'hardpoint_front_module', is_default: 0, cargo: 38 },
  { uuid: 'r-base', port_name: 'hardpoint_rear_module', is_default: 1, cargo: null },
  { uuid: 'r-cargo', port_name: 'hardpoint_rear_module', is_default: 0, cargo: 36 },
]
const galaxy = [
  { uuid: 'g-base', port_name: 'hardpoint_module', is_default: 1, cargo: null },
  { uuid: 'g-cargo', port_name: 'hardpoint_module', is_default: 0, cargo: 656 },
]

describe('CargoInline (loadout header)', () => {
  it('renders nothing for a hull with no grid and base modules', () => {
    const { container } = render(<CargoInline hull={null} modules={retaliator} selections={{}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows hull plus the equipped module, and updates when the module is swapped', () => {
    const { rerender } = render(<CargoInline hull={64} modules={galaxy} selections={{}} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('64')

    rerender(<CargoInline hull={64} modules={galaxy} selections={{ hardpoint_module: 'g-cargo' }} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('720')

    rerender(<CargoInline hull={64} modules={galaxy} selections={{}} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('64')
  })

  it('shows module cargo on a hull that has none of its own', () => {
    render(
      <CargoInline
        hull={null}
        modules={retaliator}
        selections={{ hardpoint_front_module: 'f-cargo', hardpoint_rear_module: 'r-cargo' }}
      />,
    )
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('74')
  })

  it('still works for a ship with no modules', () => {
    render(<CargoInline hull={96} modules={undefined} selections={undefined} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('96')
  })
})

describe('CargoTile (ship page)', () => {
  it('shows the stock figure and what modules can add', () => {
    render(<CargoTile hull={64} modules={galaxy} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('64')
    expect(screen.getByText(/up to 720 SCU with modules/)).toBeInTheDocument()
  })

  it('shows a dash for a modular hull with no grid of its own, plus the module ceiling', () => {
    render(<CargoTile hull={null} modules={retaliator} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('—')
    expect(screen.getByText(/up to 74 SCU with modules/)).toBeInTheDocument()
  })

  it('has no module note when modules add nothing', () => {
    render(<CargoTile hull={32} modules={[{ uuid: 'a', port_name: 'p', is_default: 1, cargo: null }]} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('32')
    expect(screen.queryByText(/with modules/)).not.toBeInTheDocument()
  })

  it('renders nothing when there is no cargo at all', () => {
    const { container } = render(<CargoTile hull={null} modules={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
