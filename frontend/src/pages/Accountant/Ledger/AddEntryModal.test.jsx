import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddEntryModal from './AddEntryModal'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => ({ ok: true, id: 1 }),
  })
})

describe('AddEntryModal', () => {
  it('submits a categorized expense with a negative amount', async () => {
    const onSaved = vi.fn()
    render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)

    await userEvent.type(screen.getByLabelText(/amount/i), '2400')
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'running_cost')
    await userEvent.type(screen.getByLabelText(/description/i), 'Fuel at Everus')
    await userEvent.click(screen.getByRole('button', { name: /record/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.amount).toBe(-2400) // Expense direction → negative
    expect(body.category).toBe('running_cost')
  })

  it('income direction posts a positive amount', async () => {
    const onSaved = vi.fn()
    render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(screen.getByLabelText(/income/i))
    await userEvent.type(screen.getByLabelText(/amount/i), '9000')
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'trading')
    await userEvent.click(screen.getByRole('button', { name: /record/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).amount).toBe(9000)
  })

  it('balance-adjustment mode posts adjustment:true without category', async () => {
    const onSaved = vi.fn()
    render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(screen.getByLabelText(/balance adjustment/i))
    await userEvent.type(screen.getByLabelText(/amount/i), '12000000')
    await userEvent.click(screen.getByRole('button', { name: /record/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.adjustment).toBe(true)
    expect(body.category).toBeUndefined()
  })

  it('rejects scientific-notation input — 1e5 can never post as amount 1', async () => {
    // HTML number inputs accept '1e5' (a valid float string), but parseInt('1e5')
    // === 1: the entry would book 1 aUEC. parseAUEC's strict contract rejects it.
    const onSaved = vi.fn()
    const { container } = render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    // fireEvent.change: '1e5' is a valid FINAL float string a real number input holds.
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1e5' } })
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'trading')
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('balance-adjustment mode preserves and posts a negative amount', async () => {
    // Downward correction (ledger says 5M, game says 4M) — the backend
    // ManualEntrySchema accepts negative adjustments; the sign must survive.
    const onSaved = vi.fn()
    const { container } = render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(screen.getByLabelText(/balance adjustment/i))
    // fireEvent.change so the negative value bypasses any native min constraint.
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '-1000000' } })
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.amount).toBe(-1000000)
    expect(body.adjustment).toBe(true)
  })

  it('shows the server error and keeps the modal open on failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'amount must be non-zero' }),
    })
    const onSaved = vi.fn()
    render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/amount/i), '1')
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'trading')
    await userEvent.click(screen.getByRole('button', { name: /record/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('amount must be non-zero'))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a client-side error and makes no POST when amount is zero', async () => {
    const onSaved = vi.fn()
    const { container } = render(<AddEntryModal onClose={() => {}} onSaved={onSaved} />)
    // Set amount to '0' via React state (fireEvent bypasses HTML min constraint validation)
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '0' } })
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'trading')
    // Use fireEvent.submit to bypass HTML constraint validation so our JS guard runs
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at least 1/i))
    expect(onSaved).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
