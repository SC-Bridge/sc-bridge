import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReportsLanding from './index'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    const json = u.includes('/pl') ? { net: 2763000 }
      : u.includes('/balance') ? { netWorth: 900000, assets: 1200000, liabilities: 300000 }
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
})
