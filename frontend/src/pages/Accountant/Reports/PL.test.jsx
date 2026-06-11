import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PL from './PL'

const PL_BODY = {
  from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z',
  revenue: { total: 4565000, lines: [{ line: 'trading_income', label: 'Trading income', value: 4200000, drill: { category: 'trading', from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z' } }] },
  expenses: { total: -1802000, lines: [{ line: 'running_cost', label: 'Running cost', value: -280000, tag: 'ship_consumables', drill: { category: 'running_cost', tag: 'ship_consumables', from: 'x', to: 'y' } }] },
  net: 2763000,
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => PL_BODY }))
})

describe('P&L page', () => {
  it('renders summary cards, statement sections, and a drill link to the ledger', async () => {
    render(<MemoryRouter initialEntries={['/accountant/reports/pl']}><PL /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Trading income')).toBeInTheDocument())
    expect(screen.getByText('4,200,000 aUEC')).toBeInTheDocument()
    // net summary card
    expect(screen.getByText('2,763,000 aUEC')).toBeInTheDocument()
    // drill link points at the pre-filtered ledger
    const link = screen.getByRole('link', { name: /trading income/i })
    expect(link.getAttribute('href')).toContain('/accountant/ledger?')
    expect(link.getAttribute('href')).toContain('category=trading')
  })
})
