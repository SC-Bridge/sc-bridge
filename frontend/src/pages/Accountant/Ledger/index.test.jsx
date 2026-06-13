import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Ledger from './index'
import { DEFAULT_SOURCES } from './FilterPanel'

const M5_SOURCES = ['po_reserve', 'po_reserve_release', 'order_fulfillment', 'contract_fine', 'wo_settlement', 'workorder_summary', 'loan_forgiveness']

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

  it('Escape closes the entry detail slide-over', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Laranite sell'))
    expect(screen.getByTestId('entry-detail')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('entry-detail')).not.toBeInTheDocument()
  })

  it('hides accrual ticks by default (source filter excludes accrual_tick)', async () => {
    renderLedger()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const calledUrl = String(globalThis.fetch.mock.calls[0][0])
    expect(calledUrl).toContain('source=parsed')
    expect(calledUrl).not.toContain('accrual_tick')
  })

  it('DEFAULT_SOURCES includes all seven M5 sources and still excludes accrual_tick', () => {
    for (const src of M5_SOURCES) expect(DEFAULT_SOURCES).toContain(src)
    expect(DEFAULT_SOURCES).not.toContain('accrual_tick')
  })

  it('renders M5 source checkboxes: reserve/release ON by default, accrual ticks OFF', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByTestId('ledger-filters')).toBeInTheDocument())
    expect(screen.getByLabelText('PO reserve')).toBeChecked()
    expect(screen.getByLabelText('Reserve release')).toBeChecked()
    expect(screen.getByLabelText('Order fulfilment')).toBeChecked()
    expect(screen.getByLabelText('Contract fine')).toBeChecked()
    expect(screen.getByLabelText('Settlement')).toBeChecked()
    expect(screen.getByLabelText('WO summary')).toBeChecked()
    expect(screen.getByLabelText('Forgiveness')).toBeChecked()
    expect(screen.getByLabelText('Accrual tick')).not.toBeChecked()
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

  it('does not show the pager when results fit on one page', async () => {
    renderLedger() // default mock: total 2
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
  })

  it('shows a pager when total exceeds the page size; Next advances page in the fetch URL', async () => {
    globalThis.fetch.mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/api/accountant/ledger')) {
          return { entries: ENTRIES, total: 120, balance: 4600, sum_income: 50000, sum_expense: -20000, page: 1 }
        }
        return {}
      },
    }))
    renderLedger()
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument()
    const prev = screen.getByRole('button', { name: /previous page/i })
    const next = screen.getByRole('button', { name: /next page/i })
    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()
    await userEvent.click(next)
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls
      const lastUrl = String(calls[calls.length - 1][0])
      expect(lastUrl).toContain('page=2')
    })
  })

  it('changing a filter resets pagination to page 1', async () => {
    globalThis.fetch.mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('/api/accountant/ledger')) {
          return { entries: ENTRIES, total: 120, balance: 4600, sum_income: 50000, sum_expense: -20000, page: 3 }
        }
        return {}
      },
    }))
    renderLedger('/accountant/ledger?page=3')
    await waitFor(() => expect(screen.getByText('Laranite sell')).toBeInTheDocument())
    await userEvent.type(screen.getByPlaceholderText(/Description/i), 'ore')
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls
      const lastUrl = String(calls[calls.length - 1][0])
      expect(lastUrl).not.toContain('page=3')
    })
  })

  it('clicking All time after Today removes from= and to= from fetch URL', async () => {
    renderLedger()
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument())
    // Establish a period filter first so there are params to clear.
    await userEvent.click(screen.getByText('Today'))
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls
      const lastUrl = String(calls[calls.length - 1][0])
      expect(lastUrl).toContain('from=')
      expect(lastUrl).toContain('to=')
    })
    // Now click All time and assert params are gone.
    await userEvent.click(screen.getByText('All time'))
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls
      const lastUrl = String(calls[calls.length - 1][0])
      expect(lastUrl).not.toContain('from=')
      expect(lastUrl).not.toContain('to=')
    })
  })
})
