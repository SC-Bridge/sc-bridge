import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CashFlow from './CashFlow'

const BODY = { from: 'a', to: 'b', interval: 'daily', series: [
  { bucket: '2026-06-01', in: 100000, out: -30000, net: 70000 },
  { bucket: '2026-06-02', in: 0, out: -5000, net: -5000 },
] }

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => BODY,
  }))
})

describe('Cash Flow page', () => {
  it('renders in/out/net cards and an interval row per bucket', async () => {
    render(<MemoryRouter><CashFlow /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('2026-06-01')).toBeInTheDocument())
    expect(screen.getByText('2026-06-02')).toBeInTheDocument()
    expect(screen.getByText('70,000 aUEC')).toBeInTheDocument()
  })

  it('shows empty state when series is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, json: async () => ({ ...BODY, series: [] }),
    }))
    render(<MemoryRouter><CashFlow /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/no cash flow data for this period/i)).toBeInTheDocument())
  })

  // Default-load test: with no URL params the page must pass from & to to the API
  // (empty query string → "from and to are required" server error on real API).
  it('includes from= and to= in the fetch URL on default load with no URL params', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200, json: async () => BODY,
    }))
    render(<MemoryRouter><CashFlow /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('2026-06-01')).toBeInTheDocument())
    const cfCalls = spy.mock.calls.filter(([url]) => String(url).includes('/reports/cash-flow'))
    expect(cfCalls.length).toBeGreaterThan(0)
    const url = String(cfCalls[0][0])
    expect(url).toContain('from=')
    expect(url).toContain('to=')
  })
})
