import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StorageBreakdown from './StorageBreakdown'

describe('StorageBreakdown', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<StorageBreakdown summary={{}} liveCargo={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when summary fields are all zero', () => {
    const { container } = render(
      <StorageBreakdown
        summary={{ external_cargo_scu: 0, fuel_cargo_scu: 0, personal_grid_microscu: 0, locker_count: 0 }}
        liveCargo={96}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('never renders an interior cargo tile, even if an old API response still carries the field', () => {
    const { container } = render(<StorageBreakdown summary={{ internal_cargo_scu: 48 }} liveCargo={48} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the external pods split for the Hull B shape', () => {
    render(<StorageBreakdown summary={{ external_cargo_scu: 512 }} liveCargo={544} />)
    expect(screen.getByText(/External Pods/i)).toBeInTheDocument()
    expect(screen.getByText('512 SCU')).toBeInTheDocument()
  })

  it('says "All cargo" when the pods are the whole cargo figure', () => {
    render(<StorageBreakdown summary={{ external_cargo_scu: 4608 }} liveCargo={4608} />)
    expect(screen.getByText(/External Pods/i)).toBeInTheDocument()
    expect(screen.getByText('All cargo')).toBeInTheDocument()
  })

  it('hides external pods that exceed the cargo figure or have no cargo figure to fit in', () => {
    const over = render(<StorageBreakdown summary={{ external_cargo_scu: 512 }} liveCargo={32} />)
    expect(over.container.firstChild).toBeNull()
    over.unmount()
    const none = render(<StorageBreakdown summary={{ external_cargo_scu: 512 }} liveCargo={null} />)
    expect(none.container.firstChild).toBeNull()
  })

  it('renders fuel cargo tile for refueler ships', () => {
    render(<StorageBreakdown summary={{ fuel_cargo_scu: 300.22 }} liveCargo={291} />)
    expect(screen.getByText(/Refuel Cargo/i)).toBeInTheDocument()
    expect(screen.getByText('300.22 SCU')).toBeInTheDocument()
  })

  it('renders suit locker count when > 0', () => {
    render(<StorageBreakdown summary={{ locker_count: 4 }} liveCargo={null} />)
    expect(screen.getByText(/Suit Lockers/i)).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('formats the personal grid in µSCU', () => {
    render(<StorageBreakdown summary={{ personal_grid_microscu: 0.5 }} liveCargo={null} />)
    expect(screen.getByText(/Personal Grid/)).toBeInTheDocument()
    expect(screen.getByText('0.5 µSCU')).toBeInTheDocument()
  })

  it('has no storage detail list, even if an old API response still carries rows', () => {
    render(
      <StorageBreakdown
        summary={{ fuel_cargo_scu: 300.22 }}
        storage={[{ id: 1, storage_type: 'external_pod', scu_capacity: 32, count: 16, container_class_name: 'MISC_Hull_B_CargoGrid' }]}
        liveCargo={291}
      />,
    )
    expect(screen.queryByText(/Storage detail/)).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
