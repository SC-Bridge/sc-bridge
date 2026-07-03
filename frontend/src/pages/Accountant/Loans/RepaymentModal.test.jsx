import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

  it('rejects scientific-notation input — 1e5 can never post as amount 1', async () => {
    // HTML number inputs accept '1e5' (a valid float string), but parseInt('1e5')
    // === 1: the repayment would book 1 aUEC. parseAUEC's strict contract rejects it.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const onSaved = vi.fn()
    render(<RepaymentModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    // fireEvent.change: '1e5' is a valid FINAL float string a real number input holds.
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1e5' } })
    await userEvent.click(screen.getByRole('button', { name: /record repayment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the echoed outstanding when the API rejects an over-payment', async () => {
    // Echo 98,500 from server (differs from loan.outstanding=100,000) to pin the real guarantee:
    // the UI must show the server-echoed value, not the stale prop.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Repayment exceeds outstanding', outstanding: 98500 }) })
    const onSaved = vi.fn()
    render(<RepaymentModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/amount/i), '150000')
    await userEvent.click(screen.getByRole('button', { name: /record repayment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Must show the echoed value (98,500) not the prop (100,000)
    expect(screen.getByRole('alert')).toHaveTextContent(/98,500/)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
