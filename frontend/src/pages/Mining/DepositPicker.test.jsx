import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DepositPicker from './DepositPicker'

// Note: in real data the `name` column mirrors the LOCALIZED deposit_name
// across every variant of a deposit — the dominant-element regex must
// operate on `class_name`, not `name`. See feedback memory:
// match-class-name-not-localized-name.
const FIXTURE_COMPOSITIONS = [
  { uuid: 'c-atacamite',         class_name: 'Atacamite',         name: 'Atacamite Deposit', deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-atacamite-iron',    class_name: 'Atacamite_Iron',    name: 'Atacamite Deposit', deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-atacamite-copper',  class_name: 'Atacamite_Copper',  name: 'Atacamite Deposit', deposit_name: 'Atacamite Deposit' },
  { uuid: 'c-asteroid-ctype',    class_name: 'Asteroid_CType',    name: 'Asteroid (C-Type)', deposit_name: 'Asteroid (C-Type)' },
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
