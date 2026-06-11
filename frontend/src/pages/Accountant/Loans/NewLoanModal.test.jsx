import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewLoanModal from './NewLoanModal'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, id: 1 }) })
})

describe('NewLoanModal', () => {
  it('submits a loan with direction, principal, rate, interval', async () => {
    const onSaved = vi.fn()
    render(<NewLoanModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/counterparty/i), '@pilot42')
    await userEvent.type(screen.getByLabelText(/principal/i), '100000')
    await userEvent.type(screen.getByLabelText(/interest rate/i), '5')
    await userEvent.click(screen.getByRole('button', { name: /create loan/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, opts] = globalThis.fetch.mock.calls.find(([u]) => String(u).endsWith('/api/accountant/loans'))
    const sent = JSON.parse(opts.body)
    expect(sent.counterparty).toBe('@pilot42')
    expect(sent.principal).toBe(100000)
    expect(sent.interest_rate).toBe(5)
    expect(sent.interest_interval).toBeDefined()
  })

  it('shows an error and stays open when the API rejects', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Bad loan' }) })
    const onSaved = vi.fn()
    render(<NewLoanModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/counterparty/i), '@x')
    await userEvent.type(screen.getByLabelText(/principal/i), '500')
    await userEvent.type(screen.getByLabelText(/interest rate/i), '5')
    await userEvent.click(screen.getByRole('button', { name: /create loan/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bad loan'))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
