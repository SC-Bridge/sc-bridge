import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DepositPicker from './DepositPicker'

const FIXTURE_COMPOSITIONS = [
  { uuid: 'c-atacamite',         name: 'Atacamite',         deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-atacamite-iron',    name: 'Atacamite_Iron',    deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-atacamite-copper',  name: 'Atacamite_Copper',  deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-asteroid-ctype',    name: 'Asteroid_CType',    deposit_name: 'Asteroid (C-Type)' },
]

describe('DepositPicker', () => {
  it('lists distinct deposit_names alphabetically', () => {
    const onChange = vi.fn()
    render(<DepositPicker compositions={FIXTURE_COMPOSITIONS} value={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /select a rock/i }))
    expect(screen.getByText('Asteroid (C-Type)')).toBeInTheDocument()
    expect(screen.getByText('Atacamite Deposit')).toBeInTheDocument()
  })

  it('picking a deposit fires onChange with { compositionUuid: null, depositName } in generic mode', () => {
    const onChange = vi.fn()
    render(<DepositPicker compositions={FIXTURE_COMPOSITIONS} value={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /select a rock/i }))
    fireEvent.click(screen.getByText('Atacamite Deposit'))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ depositName: 'Atacamite Deposit', compositionUuid: null }),
    )
  })

  it('shows dominant-element drill-in only when a deposit is selected', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <DepositPicker compositions={FIXTURE_COMPOSITIONS} value={{}} onChange={onChange} />,
    )
    expect(screen.queryByText(/dominant element/i)).toBeNull()

    rerender(
      <DepositPicker
        compositions={FIXTURE_COMPOSITIONS}
        value={{ depositName: 'Atacamite Deposit', compositionUuid: null }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText(/dominant element/i)).toBeInTheDocument()
  })

  it('picking a dominant element fires onChange with the variant compositionUuid', () => {
    const onChange = vi.fn()
    render(
      <DepositPicker
        compositions={FIXTURE_COMPOSITIONS}
        value={{ depositName: 'Atacamite Deposit', compositionUuid: null }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /all variants/i }))
    fireEvent.click(screen.getByText(/iron/i))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ compositionUuid: 'c-atacamite-iron' }),
    )
  })
})
