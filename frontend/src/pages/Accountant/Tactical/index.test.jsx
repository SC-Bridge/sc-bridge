import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Tactical from './index'

const TACTICAL = [
  { id: 5, occurred_at: '2026-06-02T00:00:00Z', amount: -80000, category: 'financial', tag: 'tactical', source: 'manual', description: 'Headhunter fee', location: null, notes: null },
]

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('/api/accountant/ledger') ? { entries: TACTICAL, total: 1, balance: -80000, page: 1 } : { ok: true, id: 9 }),
  }))
})

function renderTactical() {
  return render(<MemoryRouter initialEntries={['/accountant/tactical']}><Tactical /></MemoryRouter>)
}

describe('Tactical page', () => {
  it('fetches only financial/tactical entries', async () => {
    renderTactical()
    await waitFor(() => expect(screen.getByText('Headhunter fee')).toBeInTheDocument())
    const url = String(globalThis.fetch.mock.calls[0][0])
    expect(url).toContain('category=financial')
    expect(url).toContain('tag=tactical')
  })

  it('opens AddEntryModal preset to Tactical on + New Tactical', async () => {
    renderTactical()
    await waitFor(() => expect(screen.getByText('Headhunter fee')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /new tactical/i }))
    expect(screen.getByText('Add Entry')).toBeInTheDocument()
    // category preset to financial (Financial invest.)
    expect(screen.getByLabelText(/category/i)).toHaveValue('financial')
    // tag preset to tactical
    expect(screen.getByLabelText(/tag/i)).toHaveValue('tactical')
  })

  it('shows the empty state with no tactical investments', async () => {
    globalThis.fetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ entries: [], total: 0, balance: 0, page: 1 }) }))
    renderTactical()
    await waitFor(() => expect(screen.getByText(/no tactical investments/i)).toBeInTheDocument())
  })

  it('hides the pager when entries fit on one page', async () => {
    renderTactical() // default mock: total 1
    await waitFor(() => expect(screen.getByText('Headhunter fee')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
  })

  it('shows a pager when total exceeds the page size; Next drives the page param', async () => {
    globalThis.fetch.mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/api/accountant/ledger') ? { entries: TACTICAL, total: 120, balance: -80000, page: 1 } : { ok: true, id: 9 }),
    }))
    renderTactical()
    await waitFor(() => expect(screen.getByText('Headhunter fee')).toBeInTheDocument())
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() =>
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('page=2'))).toBe(true),
    )
  })
})
