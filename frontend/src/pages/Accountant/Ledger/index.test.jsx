import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Ledger from './index'

const ENTRIES = [
  { id: 1, occurred_at: '2026-06-03T10:00:00Z', amount: 5000, category: 'trading', tag: 'minerals', source: 'parsed', description: 'Laranite sell', location: 'New Babbage', notes: null },
  { id: 2, occurred_at: '2026-06-02T10:00:00Z', amount: -400, category: 'running_cost', tag: 'ship_consumables', source: 'manual', description: 'Repair', location: 'Lorville', notes: null },
]

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (String(url).includes('/api/accountant/ledger')) {
        return { entries: ENTRIES, total: 2, balance: 4600, sum_income: 50000, sum_expense: -20000, page: 1 }
      }
      return {}
    },
  }))
})

function renderLedger(initialEntry = '/accountant/ledger') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Ledger />
    </MemoryRouter>,
  )
}

describe('Ledger page', () => {
  it('renders entries and the all-time balance', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    expect(screen.getByText('4,600 aUEC')).toBeInTheDocument()
    expect(screen.getByText('-400 aUEC')).toBeInTheDocument()
  })

  it('shows the empty state when there are no entries', async () => {
    globalThis.fetch.mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => ({ entries: [], total: 0, balance: 0, sum_income: 0, sum_expense: 0, page: 1 }),
    }))
    renderLedger()
    await waitFor(() =>
      expect(screen.getByText(/record your first transaction/i)).toBeInTheDocument(),
    )
  })

  it('reflects the category filter in the URL (deep-linkable)', async () => {
    renderLedger('/accountant/ledger?category=trading')
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('category=trading'),
      expect.any(Object),
    )
  })

  it('opens the detail slide-over on row click', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Laranite sell'))
    expect(screen.getByTestId('entry-detail')).toBeInTheDocument()
    expect(screen.getByText(/New Babbage/)).toBeInTheDocument()
  })

  it('hides accrual ticks by default (source filter excludes accrual_tick)', async () => {
    renderLedger()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const calledUrl = String(globalThis.fetch.mock.calls[0][0])
    expect(calledUrl).toContain('source=parsed')
    expect(calledUrl).not.toContain('accrual_tick')
  })

  it('renders summary cards with balance, income, expenses, and net', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByTestId('summary-cards')).toBeInTheDocument())
    // Balance card — all-time 4,600 aUEC
    expect(screen.getByText('Balance')).toBeInTheDocument()
    // Income card — 50,000 aUEC
    expect(screen.getByText('Income')).toBeInTheDocument()
    // Expenses card — -20,000 aUEC
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    // Net card — 30,000 aUEC (50000 + -20000)
    expect(screen.getByText('Net')).toBeInTheDocument()
    expect(screen.getByText('30,000 aUEC')).toBeInTheDocument()
  })

  it('applies correct tone classes: income positive, expenses negative', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByTestId('summary-cards')).toBeInTheDocument())
    // Income value should have text-sc-success class
    const incomeValue = screen.getByText('50,000 aUEC')
    expect(incomeValue).toHaveClass('text-sc-success')
    // Expenses value should have text-sc-danger class
    const expensesValue = screen.getByText('-20,000 aUEC')
    expect(expensesValue).toHaveClass('text-sc-danger')
  })

  it('clicking Today preset makes subsequent fetch contain from= and to=', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Today'))
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls
      const lastUrl = String(calls[calls.length - 1][0])
      expect(lastUrl).toContain('from=')
      expect(lastUrl).toContain('to=')
    })
  })

  it('footer line does not contain Balance:', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    expect(screen.queryByText(/Balance:/)).not.toBeInTheDocument()
  })
})
