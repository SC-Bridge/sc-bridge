import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import InvestmentBanner from './InvestmentBanner'

function mock(body) { vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => body })) }

describe('InvestmentBanner', () => {
  it('renders the advisory surplus when cash flow is positive', async () => {
    mock({ surplus: 420000, cashFlowNet: 420000, positive: true })
    render(<InvestmentBanner />)
    await waitFor(() => expect(screen.getByText(/available for reinvestment/i)).toBeInTheDocument())
    expect(screen.getByText(/420,000 aUEC/)).toBeInTheDocument()
  })
  it('renders nothing when cash flow is neutral or negative', async () => {
    mock({ surplus: 0, cashFlowNet: -1000, positive: false })
    const { container } = render(<InvestmentBanner />)
    await waitFor(() => expect(container).toBeTruthy())
    expect(screen.queryByText(/available for reinvestment/i)).not.toBeInTheDocument()
  })
})
