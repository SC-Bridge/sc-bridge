import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BalanceSheet from './BalanceSheet'

// Cost-basis response shape (owner decision 2026-06-11):
// cash + holdings = assets; equity = assets − liabilities; no netWorth field.
const BODY = {
  at: '2026-06-11T00:00:00.000Z',
  cash: 500000,
  holdings: 1500000,
  assets: 2000000,
  liabilities: 200000,
  equity: 1800000,
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => BODY,
  }))
})

describe('Balance Sheet page', () => {
  it('renders net worth (equity), assets, and liabilities cards', async () => {
    render(<MemoryRouter><BalanceSheet /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('1,800,000 aUEC').length).toBeGreaterThan(0))
    expect(screen.getAllByText('2,000,000 aUEC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('200,000 aUEC').length).toBeGreaterThan(0)
  })

  it('renders cash and holdings rows in the Assets section', async () => {
    render(<MemoryRouter><BalanceSheet /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Cash')).toBeInTheDocument())
    expect(screen.getByText(/holdings.*cost basis/i)).toBeInTheDocument()
    expect(screen.getAllByText('500,000 aUEC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,500,000 aUEC').length).toBeGreaterThan(0)
  })

  it('shows retry button and error message on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'server error' }),
    }))
    render(<MemoryRouter><BalanceSheet /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
