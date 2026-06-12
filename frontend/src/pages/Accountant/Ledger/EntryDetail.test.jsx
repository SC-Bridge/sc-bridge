import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EntryDetail from './EntryDetail'

const baseEntry = {
  id: 1,
  description: 'Test entry',
  occurred_at: '2026-01-01T00:00:00Z',
  amount: 1000,
  category: null,
  tag: null,
  notes: null,
  loan_id: null,
}

describe('EntryDetail', () => {
  it('renders the edit form for a normal entry', () => {
    render(<EntryDetail entry={baseEntry} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('does NOT render Save button for a loan-linked entry', () => {
    const loanEntry = { ...baseEntry, loan_id: 42 }
    render(<EntryDetail entry={loanEntry} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('shows the managed-via-loan note for a loan-linked entry', () => {
    const loanEntry = { ...baseEntry, loan_id: 42 }
    render(<EntryDetail entry={loanEntry} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText(/managed via its loan/i)).toBeInTheDocument()
  })

  it('order-linked entry: managed-via-order note, Market deep link, edit controls hidden', () => {
    const orderEntry = { ...baseEntry, order_id: 9 }
    render(<MemoryRouter><EntryDetail entry={orderEntry} onClose={vi.fn()} onSaved={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText(/managed via its order/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view order/i })).toHaveAttribute('href', '/accountant/orders/market?order=9')
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('workorder-linked entry: managed-via-workorder note, detail-route link, edit controls hidden', () => {
    const woEntry = { ...baseEntry, workorder_id: 3 }
    render(<MemoryRouter><EntryDetail entry={woEntry} onClose={vi.fn()} onSaved={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText(/managed via its workorder/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view workorder/i })).toHaveAttribute('href', '/accountant/orders/workorders/3')
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })
})
