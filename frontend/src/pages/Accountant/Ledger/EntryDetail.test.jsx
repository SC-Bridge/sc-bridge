import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
