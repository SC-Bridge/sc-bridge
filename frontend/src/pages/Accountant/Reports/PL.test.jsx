import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PL from './PL'

const PL_BODY = {
  from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z',
  revenue: { total: 4565000, lines: [{ line: 'trading_income', label: 'Trading income', value: 4200000, drill: { category: 'trading', from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z' } }] },
  expenses: { total: -1802000, lines: [{ line: 'running_cost', label: 'Running cost', value: -280000, tag: 'ship_consumables', drill: { category: 'running_cost', tag: 'ship_consumables', from: 'x', to: 'y' } }] },
  net: 2763000,
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => PL_BODY }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('P&L page', () => {
  it('renders summary cards, statement sections, and a drill link to the ledger', async () => {
    render(<MemoryRouter initialEntries={['/accountant/reports/pl']}><PL /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Trading income')).toBeInTheDocument())
    expect(screen.getByText('4,200,000 aUEC')).toBeInTheDocument()
    // net summary card
    expect(screen.getByText('2,763,000 aUEC')).toBeInTheDocument()
    // drill link points at the pre-filtered ledger
    const link = screen.getByRole('link', { name: /trading income/i })
    expect(link.getAttribute('href')).toContain('/accountant/ledger?')
    expect(link.getAttribute('href')).toContain('category=trading')
  })

  it('shows error alert and Retry button on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'server error' }),
    }))
    render(<MemoryRouter initialEntries={['/accountant/reports/pl']}><PL /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  // Default-load test: with no URL params the page must pass from & to to the API
  // (empty query string → "from and to are required" server error on real API).
  it('includes from= and to= in the fetch URL on default load with no URL params', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, json: async () => PL_BODY,
    }))
    render(<MemoryRouter initialEntries={['/accountant/reports/pl']}><PL /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Trading income')).toBeInTheDocument())
    const plCalls = spy.mock.calls.filter(([url]) => String(url).includes('/reports/pl'))
    expect(plCalls.length).toBeGreaterThan(0)
    const url = String(plCalls[0][0])
    expect(url).toContain('from=')
    expect(url).toContain('to=')
  })
})
