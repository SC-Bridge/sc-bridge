import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoanDetail from './LoanDetail'

const DETAIL = {
  loan: { id: 14, direction: 'outgoing', counterparty: '@pilot42', principal: 100000, interest_rate: 5, interest_interval: 'monthly', started_at: '2026-06-01T00:00:00Z', status: 'open' },
  outstanding: 42500,
  accrued: 2500,
  fee: 7500, // amended formula: 100000 × 5% × 1.5 (matches the UX thumbnail's booked fee)
  repayments: [{ id: 1, amount: 40000, occurred_at: '2026-06-10T00:00:00Z' }, { id: 2, amount: 20000, occurred_at: '2026-06-18T00:00:00Z' }],
  preview: { nextTickAt: '2026-07-01T00:00:00Z', projectedAmount: 2125, paybackTotal: 44625 },
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/api/accountant/loans/14') ? DETAIL : {}),
  }))
})

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/accountant/loans/14']}>
      <Routes><Route path="/accountant/loans/:id" element={<LoanDetail />} /></Routes>
    </MemoryRouter>,
  )
}

describe('LoanDetail', () => {
  it('renders params, outstanding, and the UPCOMING accrual tick preview', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    expect(screen.getByText('42,500 aUEC')).toBeInTheDocument()
    // schedule preview: upcoming tick only (UX §B.2)
    expect(screen.getByText(/payback total/i)).toBeInTheDocument()
    expect(screen.getByText('44,625 aUEC')).toBeInTheDocument()
  })

  it('lists repayment history (which lives here, ticks do not)', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('40,000 aUEC')).toBeInTheDocument())
    expect(screen.getByText('20,000 aUEC')).toBeInTheDocument()
  })

  it('opens the RepaymentModal from Record repayment', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    const btn = screen.getByRole('button', { name: /record repayment/i })
    expect(btn).toBeEnabled()
  })
})
