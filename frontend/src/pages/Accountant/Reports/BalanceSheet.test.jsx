import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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

  // Loop-regression test: with no URL params the `at` value must be stable across
  // renders so useGet never fires a loop of fetches for /reports/balance.
  // We assert ≤ 2 (accounting for React double-invoke edge cases in test environments)
  // rather than exactly 1, to avoid false failures from module-level inflight-map
  // state shared across tests. The bug produced 15+ calls; ≤ 2 proves the loop is gone.
  it('fetches /reports/balance at most twice with no URL params (no infinite loop)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, json: async () => BODY,
    }))
    spy.mockClear()
    render(<MemoryRouter><BalanceSheet /></MemoryRouter>)
    // Wait until the data appears — the component has settled.
    await waitFor(() => expect(screen.getAllByText('1,800,000 aUEC').length).toBeGreaterThan(0))
    // Allow one extra tick for any spurious re-fetch to appear.
    await act(async () => {})
    const balanceCalls = spy.mock.calls.filter(([url]) => String(url).includes('/reports/balance'))
    expect(balanceCalls.length).toBeLessThanOrEqual(2)
  })
})
