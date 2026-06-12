import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FulfillmentModal from './FulfillmentModal'

// Late order: deliver_by long past, so any occurred_at triggers the +10% rate.
const LATE_ORDER = {
  id: 82, type: 'sale', item: 'Quantanium', status: 'in_progress',
  quantity: 200, price_per_unit: 1000,
  deliver_by: '2020-01-01T00:00:00Z',
  rate_change_condition: 'late', rate_change_pct: 10,
  fulfilledQty: 50, remaining: 150,
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
})
afterEach(() => vi.restoreAllMocks())

describe('FulfillmentModal', () => {
  it('caps quantity at remaining and rejects 0', async () => {
    const onSaved = vi.fn()
    const { container } = render(<FulfillmentModal order={LATE_ORDER} onClose={() => {}} onSaved={onSaved} />)
    expect(screen.getByLabelText(/^quantity/i)).toHaveAttribute('max', '150')
    // fireEvent bypasses HTML constraint validation so the JS guard runs (AddEntryModal pattern).
    fireEvent.change(screen.getByLabelText(/^quantity/i), { target: { value: '0' } })
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/quantity must be greater than 0/i))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('previews the effective-rate amount — late order: 50 × 1,100 → 55,000', async () => {
    render(<FulfillmentModal order={LATE_ORDER} onClose={() => {}} onSaved={() => {}} />)
    await userEvent.type(screen.getByLabelText(/^quantity/i), '50')
    expect(screen.getByText(/55,000 aUEC/)).toBeInTheDocument()
    expect(screen.getByText(/effective rate 1,100 \(late \+10%\)/i)).toBeInTheDocument()
  })

  it('amount override field wins and is sent as integer', async () => {
    const onSaved = vi.fn()
    render(<FulfillmentModal order={LATE_ORDER} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/^quantity/i), '50')
    await userEvent.type(screen.getByLabelText(/amount override/i), '99999')
    await userEvent.click(screen.getByRole('button', { name: /record fulfilment/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, opts] = globalThis.fetch.mock.calls.find(([u]) => String(u).endsWith('/orders/82/fulfillments'))
    expect(url).toBe('/api/accountant/orders/82/fulfillments')
    const sent = JSON.parse(opts.body)
    expect(sent.quantity).toBe(50)
    expect(sent.amount).toBe(99999)
  })

  it('server 400 echoing remaining shows inline', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Quantity exceeds remaining', remaining: 50 }),
    })
    const onSaved = vi.fn()
    render(<FulfillmentModal order={LATE_ORDER} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/^quantity/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /record fulfilment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Quantity exceeds remaining — remaining is 50/))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('submits occurred_at + location', async () => {
    const onSaved = vi.fn()
    render(<FulfillmentModal order={LATE_ORDER} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.type(screen.getByLabelText(/^quantity/i), '50')
    await userEvent.type(screen.getByLabelText(/location/i), 'Area18')
    await userEvent.click(screen.getByRole('button', { name: /record fulfilment/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, opts] = globalThis.fetch.mock.calls.find(([u]) => String(u).endsWith('/orders/82/fulfillments'))
    const sent = JSON.parse(opts.body)
    expect(sent.location).toBe('Area18')
    expect(sent.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(sent.amount).toBeUndefined()
  })
})
