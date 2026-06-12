import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TerminateModal from './TerminateModal'

const WORKORDER = { id: 7, title: 'Laranite hauling run', status: 'in_progress' }

// Plan fixture: components carry `incurred`; the closed one must never be
// selectable (the server 400s on already-closed targets).
const ORDERS = [
  { id: 1, type: 'purchase', category: 'production', item: 'Hull plating', status: 'open', incurred: 80000 },
  { id: 2, type: 'sale', category: 'trading', item: 'Laranite', status: 'in_progress', incurred: 5000 },
  { id: 3, type: 'purchase', category: 'production', item: 'Closed already', status: 'complete', incurred: 999999 },
]

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi(response = ok({ ok: true, settlement: 0, workorderStatus: 'terminated' })) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response)
}

beforeEach(() => mockApi())
afterEach(() => vi.restoreAllMocks())

function renderModal(props = {}) {
  return render(
    <TerminateModal workorder={WORKORDER} orders={ORDERS} onClose={vi.fn()} onSaved={vi.fn()} {...props} />,
  )
}

function postedBody() {
  const call = globalThis.fetch.mock.calls.find(
    ([u, o]) => String(u).endsWith('/api/accountant/workorders/7/terminate') && o?.method === 'POST',
  )
  return call ? JSON.parse(call[1].body) : null
}

describe('TerminateModal', () => {
  it('note is mandatory — submit with empty note blocks client-side AND renders server 400 if forced', async () => {
    renderModal()
    const submit = screen.getByRole('button', { name: /terminate workorder/i })

    // Truly empty note never reaches the server.
    await userEvent.click(submit)
    expect(postedBody()).toBeNull()

    // Whitespace defeats `required` but not the trim check — still blocked.
    await userEvent.type(screen.getByLabelText(/termination note/i), '   ')
    await userEvent.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent(/note is required/i)
    expect(postedBody()).toBeNull()

    // Forced past the client: the server stays the authority and its 400 echo renders.
    mockApi({ ok: false, status: 400, json: async () => ({ error: 'note must contain at least 1 character' }) })
    await userEvent.clear(screen.getByLabelText(/termination note/i))
    await userEvent.type(screen.getByLabelText(/termination note/i), 'real note')
    await userEvent.click(submit)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at least 1 character/i))
  })

  it('terminated_by toggles the settlement field semantics: counterparty pre-fills the suggestion, you requires manual amount', async () => {
    renderModal()
    // Closed components are outside the selectable scope entirely.
    expect(screen.queryByLabelText(/O-3/)).not.toBeInTheDocument()

    // Counterparty (default): all selected → suggestion 85,000 shown and editable.
    expect(screen.getByLabelText('Counterparty')).toBeChecked()
    const amount = screen.getByLabelText(/settlement amount/i)
    expect(amount).toHaveValue(85000)
    expect(screen.getByText(/85,000 aUEC/)).toBeInTheDocument()
    await userEvent.clear(amount)
    await userEvent.type(amount, '90000')
    expect(amount).toHaveValue(90000)

    // You: amount REQUIRED, no suggestion possible (counterparty costs aren't on your books).
    await userEvent.click(screen.getByLabelText('You'))
    expect(screen.getByLabelText(/settlement amount/i)).toHaveValue(null)
    expect(screen.getByLabelText(/settlement amount/i)).toBeRequired()
    expect(screen.queryByText(/suggestion/i)).not.toBeInTheDocument()
  })

  it('partial selection: deselecting components re-sums the suggestion and sends order_ids', async () => {
    renderModal()
    await userEvent.click(screen.getByLabelText(/O-1/))
    // Only #2 selected → suggestion re-sums to 5,000.
    expect(screen.getByLabelText(/settlement amount/i)).toHaveValue(5000)
    // Server rule surfaced, not duplicated: partial keeps the workorder in progress.
    expect(screen.getByText(/partial termination/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/termination note/i), 'dropped this leg')
    await userEvent.click(screen.getByRole('button', { name: /terminate workorder/i }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody()).toEqual({
      note: 'dropped this leg',
      terminated_by: 'counterparty',
      settlement_amount: 5000,
      order_ids: [2],
    })

    // Full selection sends NO order_ids (full termination).
    cleanup()
    globalThis.fetch.mockClear()
    renderModal()
    await userEvent.type(screen.getByLabelText(/termination note/i), 'full stop')
    await userEvent.click(screen.getByRole('button', { name: /terminate workorder/i }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody()).toEqual({
      note: 'full stop',
      terminated_by: 'counterparty',
      settlement_amount: 85000,
    })
  })

  it('0 settlement is allowed; override wins', async () => {
    renderModal()
    const amount = screen.getByLabelText(/settlement amount/i)
    await userEvent.clear(amount)
    await userEvent.type(amount, '0')
    await userEvent.type(screen.getByLabelText(/termination note/i), 'walked away amicably')
    await userEvent.click(screen.getByRole('button', { name: /terminate workorder/i }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody().settlement_amount).toBe(0)
    expect(postedBody().order_ids).toBeUndefined()

    // Manual override beats the 85,000 suggestion.
    cleanup()
    globalThis.fetch.mockClear()
    renderModal()
    const amount2 = screen.getByLabelText(/settlement amount/i)
    await userEvent.clear(amount2)
    await userEvent.type(amount2, '123456')
    await userEvent.type(screen.getByLabelText(/termination note/i), 'negotiated down')
    await userEvent.click(screen.getByRole('button', { name: /terminate workorder/i }))
    await waitFor(() => expect(postedBody()).not.toBeNull())
    expect(postedBody().settlement_amount).toBe(123456)
  })

  it('submit posts { note, terminated_by, settlement_amount, order_ids? } and announces', async () => {
    const announced = vi.fn()
    window.addEventListener('accountant:changed', announced)
    const onSaved = vi.fn()
    renderModal({ onSaved })

    await userEvent.click(screen.getByLabelText('You'))
    await userEvent.type(screen.getByLabelText(/settlement amount/i), '25000')
    await userEvent.type(screen.getByLabelText(/termination note/i), 'cutting losses')
    await userEvent.click(screen.getByRole('button', { name: /terminate workorder/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(postedBody()).toEqual({
      note: 'cutting losses',
      terminated_by: 'you',
      settlement_amount: 25000,
    })
    expect(announced).toHaveBeenCalled()
    window.removeEventListener('accountant:changed', announced)
  })
})
