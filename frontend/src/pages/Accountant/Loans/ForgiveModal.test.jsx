import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForgiveModal from './ForgiveModal'

const LOAN = { id: 7, counterparty: '@pilot42', outstanding: 100000, direction: 'outgoing' }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ForgiveModal', () => {
  it('records a partial forgiveness', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, settled: false, outstanding: 60000 }) })
    const onSaved = vi.fn()
    render(<ForgiveModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/forgive amount/i), '40000')
    await userEvent.click(screen.getByRole('button', { name: /^forgive$/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/loans/7/forgive', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the echoed outstanding when the API rejects an over-forgiveness', async () => {
    // Echo 98,500 from server (differs from loan.outstanding=100,000) to pin the real guarantee:
    // the UI must show the server-echoed value, not the stale prop.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Forgiveness exceeds outstanding', outstanding: 98500 }) })
    const onSaved = vi.fn()
    render(<ForgiveModal loan={LOAN} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/forgive amount/i), '150000')
    await userEvent.click(screen.getByRole('button', { name: /^forgive$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Must show the echoed value (98,500) not the prop (100,000)
    expect(screen.getByRole('alert')).toHaveTextContent(/98,500/)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('plain failures (no server echo) show the message without the outstanding decoration', async () => {
    // A 500/network error carries no `outstanding` — decorating it would imply
    // an over-forgiveness rejection that never happened.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'forgive exploded' }) })
    render(<ForgiveModal loan={LOAN} onClose={() => {}} onSaved={() => {}} />)
    await userEvent.type(screen.getByLabelText(/forgive amount/i), '40000')
    await userEvent.click(screen.getByRole('button', { name: /^forgive$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('forgive exploded')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/outstanding is/i)
  })

  it('explains the P&L direction: outgoing loan → absorbed loss', () => {
    render(<ForgiveModal loan={LOAN} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText(/you absorb this as a loss \(P&L expense\)/i)).toBeInTheDocument()
  })

  it('explains the P&L direction: incoming loan → debt relief', () => {
    render(<ForgiveModal loan={{ ...LOAN, direction: 'incoming' }} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText(/booked as debt relief \(P&L income\)/i)).toBeInTheDocument()
  })
})
