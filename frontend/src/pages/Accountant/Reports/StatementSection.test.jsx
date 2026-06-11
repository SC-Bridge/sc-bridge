import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StatementSection } from './StatementSection'

describe('StatementSection / StatementRow', () => {
  it('renders titled rows with values, a total rule, and a drill link', () => {
    render(
      <MemoryRouter>
        <StatementSection title="Revenue" rows={[
          { label: 'Trading income', value: 4200000, subPct: 92, drillHref: '/accountant/ledger?category=trading' },
          { label: 'Total revenue', value: 4565000, total: true },
        ]} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('Trading income')).toBeInTheDocument()
    // value formatted via formatAUEC
    expect(screen.getByText('4,200,000 aUEC')).toBeInTheDocument()
    // drill row renders as a link
    expect(screen.getByRole('link', { name: /trading income/i })).toHaveAttribute('href', '/accountant/ledger?category=trading')
    // %-of-revenue sub-figure
    expect(screen.getByText('92%')).toBeInTheDocument()
  })
})
