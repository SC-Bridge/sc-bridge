import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RepaymentModal from './RepaymentModal'

const LOAN = { id: 7, counterparty: '@pilot42', outstanding: 100000 }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RepaymentModal', () => {
  it('records a partial repayment', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, settled: false, outstanding: 60000 }) })
    const onSaved = vi.fn()
    render(<RepaymentModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/amount/i), '40000')
    await userEvent.click(screen.getByRole('button', { name: /record repayment/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/loans/7/repayments', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the echoed outstanding when the API rejects an over-payment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Repayment exceeds outstanding', outstanding: 100000 }) })
    const onSaved = vi.fn()
    render(<RepaymentModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/amount/i), '150000')
    await userEvent.click(screen.getByRole('button', { name: /record repayment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/100,000/)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
