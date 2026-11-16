import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AccountFilter from './AccountFilter'

const accounts = [
  { id: 1, label: 'Main', color: '#22d3ee' },
  { id: 2, rsi_handle: 'RASKYL', color: '#f97316' },
]

const makeFilter = (over = {}) => ({
  active: true,
  selectedIds: new Set([1]),
  isAll: false,
  toggle: vi.fn(),
  selectAll: vi.fn(),
  ...over,
})

describe('AccountFilter', () => {
  it('renders nothing when inactive', () => {
    const { container } = render(<AccountFilter accounts={accounts} filter={makeFilter({ active: false })} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a chip per account with its colour and checked state, plus All accounts', () => {
    render(<AccountFilter accounts={accounts} filter={makeFilter()} />)
    const main = screen.getByRole('checkbox', { name: /Main/ })
    const alt = screen.getByRole('checkbox', { name: /RASKYL/ })
    expect(main).toHaveAttribute('aria-checked', 'true')
    expect(alt).toHaveAttribute('aria-checked', 'false')
    expect(main.querySelector('span[style]').style.backgroundColor).toBe('rgb(34, 211, 238)')
    expect(screen.getByRole('checkbox', { name: /All accounts/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('marks All accounts checked when isAll', () => {
    render(<AccountFilter accounts={accounts} filter={makeFilter({ isAll: true, selectedIds: new Set([1, 2]) })} />)
    expect(screen.getByRole('checkbox', { name: /All accounts/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking a chip calls toggle; All accounts calls selectAll', () => {
    const filter = makeFilter()
    render(<AccountFilter accounts={accounts} filter={filter} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /RASKYL/ }))
    expect(filter.toggle).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('checkbox', { name: /All accounts/ }))
    expect(filter.selectAll).toHaveBeenCalled()
  })
})
