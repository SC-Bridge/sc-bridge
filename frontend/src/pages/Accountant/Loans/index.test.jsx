import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Loans from './index'

const LOANS = [
  { id: 14, direction: 'outgoing', counterparty: '@pilot42', principal: 100000, outstanding: 42500, interest_rate: 5, interest_interval: 'monthly', status: 'open', nextTickAt: '2026-07-01T00:00:00Z' },
  { id: 11, direction: 'incoming', counterparty: '@cmdr_x', principal: 250000, outstanding: 0, interest_rate: 3, interest_interval: 'weekly', status: 'settled', nextTickAt: '2026-07-01T00:00:00Z' },
]

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/api/accountant/loans') ? { loans: LOANS } : {}),
  }))
})

function renderLoans(entry = '/accountant/loans') {
  return render(<MemoryRouter initialEntries={[entry]}><Loans /></MemoryRouter>)
}

describe('Loans page', () => {
  it('renders the outgoing tab by default with outstanding amounts', async () => {
    renderLoans()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    expect(screen.getByText('42,500 aUEC')).toBeInTheDocument()
  })

  it('switches to the incoming tab via URL param', async () => {
    renderLoans('/accountant/loans?tab=incoming')
    await waitFor(() => expect(screen.getByText('@cmdr_x')).toBeInTheDocument())
    expect(screen.queryByText('@pilot42')).not.toBeInTheDocument()
  })

  it('opens NewLoanModal from the action button', async () => {
    renderLoans()
    await waitFor(() => expect(screen.getByText('@pilot42')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /new loan/i }))
    expect(screen.getByRole('heading', { name: /new loan/i })).toBeInTheDocument()
  })

  it('shows the empty state with no loans', async () => {
    globalThis.fetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ loans: [] }) }))
    renderLoans()
    await waitFor(() => expect(screen.getByText(/no loans yet/i)).toBeInTheDocument())
  })

})
