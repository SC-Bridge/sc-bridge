import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReportsLanding from './index'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    // Cost-basis balance shape: equity replaces netWorth as the canonical figure.
    const json = u.includes('/pl') ? { net: 2763000 }
      : u.includes('/balance') ? { cash: 500000, holdings: 1500000, assets: 2000000, liabilities: 200000, equity: 1800000 }
      : u.includes('/cash-flow') ? { series: [{ bucket: '2026-06-01', net: 70000 }] }
      : {}
    return { ok: true, status: 200, json: async () => json }
  })
})

describe('Reports landing', () => {
  it('renders a tile per report with headline figures and links', async () => {
    render(<MemoryRouter><ReportsLanding /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('link', { name: /profit & loss/i })).toHaveAttribute('href', '/accountant/reports/pl'))
    expect(screen.getByRole('link', { name: /balance sheet/i })).toHaveAttribute('href', '/accountant/reports/balance')
    expect(screen.getByRole('link', { name: /net worth/i })).toHaveAttribute('href', '/accountant/reports/net-worth')
    expect(screen.getByRole('link', { name: /cash flow/i })).toHaveAttribute('href', '/accountant/reports/cash-flow')
  })

  it('balance sheet and net worth tiles show equity figure', async () => {
    render(<MemoryRouter><ReportsLanding /></MemoryRouter>)
    // equity = 1,800,000; both tiles should display it
    await waitFor(() => expect(screen.getAllByText(/1\.8M aUEC|1,800,000 aUEC/).length).toBeGreaterThanOrEqual(2))
  })
})
