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
        return { entries: ENTRIES, total: 2, balance: 4600, page: 1 }
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
      json: async () => ({ entries: [], total: 0, balance: 0, page: 1 }),
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
})
