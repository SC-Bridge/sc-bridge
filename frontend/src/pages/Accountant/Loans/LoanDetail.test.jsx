import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoanDetail from './LoanDetail'

const DETAIL = {
  loan: { id: 14, direction: 'outgoing', counterparty: '@pilot42', principal: 100000, interest_rate: 5, interest_interval: 'monthly', started_at: '2026-06-01T00:00:00Z', status: 'open' },
  outstanding: 42500,
  accrued: 2500,
  fee: 7500, // amended formula: 100000 × 5% × 1.5 (matches the UX thumbnail's booked fee)
  repayments: [{ id: 1, amount: 40000, occurred_at: '2026-06-10T00:00:00Z' }, { id: 2, amount: 20000, occurred_at: '2026-06-18T00:00:00Z' }],
  forgiveness: [{ id: 9, amount: 15000, occurred_at: '2026-06-12T00:00:00Z', notes: 'goodwill' }],
  preview: { nextTickAt: '2026-07-01T00:00:00Z', projectedAmount: 2125, paybackTotal: 44625 },
}

// Settled loan with remainder (manual write-off scenario): entries still sum to 45000
// because POST /settle does NOT add a zero-ing entry — it just flips status.
const SETTLED_WITH_REMAINDER = {
  loan: { id: 15, direction: 'outgoing', counterparty: '@deadbeat', principal: 50000, interest_rate: 5, interest_interval: 'monthly', started_at: '2026-06-01T00:00:00Z', status: 'settled' },
  outstanding: 45000,
  accrued: 0,
  fee: 0,
  repayments: [],
  preview: { nextTickAt: '2026-07-01T00:00:00Z', projectedAmount: 0, paybackTotal: 0 },
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true, status: 200,
    json: async () => {
      if (String(url).includes('/api/accountant/loans/14')) return DETAIL
      if (String(url).includes('/api/accountant/loans/15')) return SETTLED_WITH_REMAINDER
      return {}
    },
  }))
})

function renderDetail(id = '14') {
  return render(
    <MemoryRouter initialEntries={[`/accountant/loans/${id}`]}>
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

  it('lists forgiveness history (distinct from repayments)', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('Forgiveness')).toBeInTheDocument())
    expect(screen.getByText('15,000 aUEC')).toBeInTheDocument()
    expect(screen.getByText(/goodwill/)).toBeInTheDocument()
  })

  it('omits the Forgiveness panel when there is no forgiveness history', async () => {
    renderDetail('15') // SETTLED_WITH_REMAINDER has no forgiveness key
    await waitFor(() => expect(screen.getByText('@deadbeat')).toBeInTheDocument())
    expect(screen.queryByText('Forgiveness')).not.toBeInTheDocument()
  })

  it('opens the RepaymentModal from Record repayment', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /record repayment/i }))
    expect(screen.getByRole('heading', { name: /record repayment · @pilot42/i })).toBeInTheDocument()
  })

  it('shows an actionError alert when settle fails', async () => {
    // First call (GET) succeeds; subsequent POST /settle returns 500.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST') {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
      }
      return { ok: true, status: 200, json: async () => DETAIL }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderDetail()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close loan/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/boom/)
  })

  it('renders Forgive… beside Record repayment on open loans and opens the modal', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /record repayment/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /forgive…/i }))
    expect(screen.getByRole('heading', { name: /forgive loan · @pilot42/i })).toBeInTheDocument()
  })

  it('does NOT render Forgive… for settled loans', async () => {
    renderDetail('15')
    await waitFor(() => expect(screen.getByText('@deadbeat')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /forgive/i })).not.toBeInTheDocument()
  })

  it('settled loan with remainder shows Outstanding: 0 aUEC and Written off line', async () => {
    renderDetail('15')
    await waitFor(() => expect(screen.getByText('@deadbeat')).toBeInTheDocument())
    // Outstanding paragraph must show 0 for settled loans
    expect(screen.getByText(/^outstanding:/i).closest('p')).toHaveTextContent('0 aUEC')
    // Written-off line only when API outstanding > 0
    const writtenOff = screen.getByText(/written off/i)
    expect(writtenOff).toBeInTheDocument()
    expect(writtenOff.closest('p')).toHaveTextContent('45,000 aUEC')
  })
})
