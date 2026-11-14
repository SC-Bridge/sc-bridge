import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StorageBreakdown, { StoragePanel } from './StorageBreakdown'

// Field values as the API returned them on production, 2026-11-14.
const galaxyModules = [
  { uuid: 'g-stock', port_name: 'hardpoint_module', display_name: 'Galaxy Stock Module', is_default: 1, cargo: null },
  { uuid: 'g-tmpl', port_name: 'hardpoint_module', display_name: null, is_default: 0, cargo: null },
  { uuid: 'g-cargo', port_name: 'hardpoint_module', display_name: 'Galaxy Cargo Module', is_default: 0, cargo: 656 },
  { uuid: 'g-med', port_name: 'hardpoint_module', display_name: 'Galaxy Med Bay Module', is_default: 0, cargo: 4 },
]
const retaliatorModules = [
  { uuid: 'f-base', port_name: 'hardpoint_front_module', is_default: 1, cargo: null },
  { uuid: 'f-cargo', port_name: 'hardpoint_front_module', is_default: 0, cargo: 38 },
  { uuid: 'r-base', port_name: 'hardpoint_rear_module', is_default: 1, cargo: null },
  { uuid: 'r-cargo', port_name: 'hardpoint_rear_module', is_default: 0, cargo: 36 },
]
const galaxy = { cargo: 64, internal_cargo_scu: null, external_cargo_scu: null, fuel_cargo_scu: null, personal_grid_microscu: null, locker_count: null, storage: [] }
const retaliator = { cargo: null, internal_cargo_scu: null, personal_grid_microscu: 530000, storage: [] }
const mole = { cargo: 32, internal_cargo_scu: 96, storage: [] }
const hullC = { cargo: 4608, internal_cargo_scu: 0, external_cargo_scu: 4608, storage: [] }
const carrack = { cargo: 456, internal_cargo_scu: 456, storage: [] }

describe('StoragePanel (ship overview)', () => {
  it('Galaxy: shows the live hull cargo and the module ceiling even though the backfill columns are NULL', () => {
    render(<StoragePanel ship={galaxy} modules={galaxyModules} />)
    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('64')
    expect(screen.getByText(/up to 720 SCU with modules/)).toBeInTheDocument()
  })

  it('Retaliator: a dash for the gridless hull, the module ceiling, and its personal grid', () => {
    render(<StoragePanel ship={retaliator} modules={retaliatorModules} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('—')
    expect(screen.getByText(/up to 74 SCU with modules/)).toBeInTheDocument()
    expect(screen.getByText(/Personal Grid/)).toBeInTheDocument()
  })

  it('MOLE: ship.cargo wins over the stale interior figure', () => {
    render(<StoragePanel ship={mole} modules={[]} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('32')
    expect(screen.queryByText(/96/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Interior Cargo/i)).not.toBeInTheDocument()
  })

  it('Carrack: the cargo figure appears once, not again as an interior tile', () => {
    render(<StoragePanel ship={carrack} modules={undefined} />)
    expect(screen.getAllByText(/456/)).toHaveLength(1)
    expect(screen.queryByText(/Interior Cargo/i)).not.toBeInTheDocument()
  })

  it('Hull C: keeps the external pods label without repeating the number', () => {
    render(<StoragePanel ship={hullC} modules={[]} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('4,608')
    expect(screen.getAllByText(/4,608/)).toHaveLength(1)
    expect(screen.getByText(/External Pods/i)).toBeInTheDocument()
    expect(screen.getByText('All cargo')).toBeInTheDocument()
  })

  it('Hull B shape: external pods that are part of the cargo show as a split', () => {
    render(<StoragePanel ship={{ cargo: 544, internal_cargo_scu: 32, external_cargo_scu: 512, storage: [] }} modules={[]} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('544')
    expect(screen.getByText('512 SCU')).toBeInTheDocument()
    expect(screen.queryByText('32 SCU')).not.toBeInTheDocument()
  })

  it('drops an external pods figure that contradicts ship.cargo', () => {
    render(<StoragePanel ship={{ cargo: 32, external_cargo_scu: 512, storage: [] }} modules={[]} />)
    expect(screen.getByTestId('cargo-total')).toHaveTextContent('32')
    expect(screen.queryByText(/External Pods/i)).not.toBeInTheDocument()
  })

  it('keeps refuel cargo, personal grid, lockers and the detail list', () => {
    render(
      <StoragePanel
        ship={{
          cargo: 96, internal_cargo_scu: 96, fuel_cargo_scu: 300.22, personal_grid_microscu: 0.5, locker_count: 4,
          storage: [{ id: 1, storage_type: 'suit_locker', count: 4, container_class_name: 'locker' }],
        }}
        modules={[]}
      />,
    )
    expect(screen.getByText('300.22 SCU')).toBeInTheDocument()
    expect(screen.getByText(/Personal Grid/)).toBeInTheDocument()
    expect(screen.getByText(/Suit Lockers/)).toBeInTheDocument()
    expect(screen.getByText(/Storage detail \(1\)/)).toBeInTheDocument()
  })

  it('renders nothing — no header, no box — when there is nothing to show', () => {
    const { container } = render(
      <StoragePanel ship={{ cargo: null, internal_cargo_scu: null, storage: [] }} modules={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when only the stale interior figure exists and the ship has no cargo', () => {
    const { container } = render(<StoragePanel ship={{ cargo: null, internal_cargo_scu: 96, storage: [] }} modules={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('StorageBreakdown with liveCargo', () => {
  it('is unchanged without liveCargo (interior tile still renders)', () => {
    render(<StorageBreakdown storage={[]} summary={{ internal_cargo_scu: 48 }} />)
    expect(screen.getByText(/Interior Cargo/i)).toBeInTheDocument()
  })

  it('renders nothing when liveCargo suppresses the only tile', () => {
    const { container } = render(<StorageBreakdown storage={[]} summary={{ internal_cargo_scu: 48 }} liveCargo={32} />)
    expect(container.firstChild).toBeNull()
  })
})
