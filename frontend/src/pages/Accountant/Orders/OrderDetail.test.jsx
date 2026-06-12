import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrderDetail from './OrderDetail'

const DETAIL = {
  order: {
    id: 82, type: 'purchase', status: 'in_progress', category: 'production', tag: 'general',
    item: 'Quantanium', quantity: 200, price_per_unit: 1000, total: 200000,
    counterparty: '@miner7', start_at: '2026-06-01T00:00:00Z',
    // fine_interval deviates from the template ON PURPOSE while staying out of
    // modified_fields — a regression to client-side recompute (§5.1 failure
    // mode) would mark it and fail the no-marker assertion.
    deliver_by: '2026-06-30T00:00:00Z', fine_interval: 'weekly', fine_rate_type: 'percent',
    fine_rate: 1.5, rate_change_condition: null, rate_change_pct: 0,
    termination_clause: 'standard', workorder_id: null,
    modified_fields: ['deliver_by', 'fine_rate'], notes: 'priority client',
  },
  fulfillments: [
    { id: 3, amount: -45000, quantity: 45, price_per_unit: 1000, location: 'Area18', occurred_at: '2026-06-05T00:00:00Z' },
  ],
  fines: [
    { id: 9, amount: 2500, occurred_at: '2026-06-06T00:00:00Z', tick_index: 1 },
  ],
  reserve: { reserved: 200000, released: 140000, open: 60000 },
  computed: { fulfilledQty: 45, remaining: 155, accruedFines: 2500, effectiveRate: 1000 },
}

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi(detail = DETAIL) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const s = String(url)
    if (s.includes('/api/accountant/orders/82')) return ok(detail)
    return ok({})
  })
}

beforeEach(() => mockApi())
afterEach(() => vi.restoreAllMocks())

async function renderDetail(onClose = vi.fn()) {
  const view = render(<OrderDetail id="82" onClose={onClose} />)
  await waitFor(() => expect(screen.getByText(/Quantanium/)).toBeInTheDocument())
  return view
}

describe('OrderDetail slide-over', () => {
  it('marks modified contract fields only', async () => {
    await renderDetail()
    expect(screen.getAllByTestId('modified-marker')).toHaveLength(2)
    expect(within(screen.getByTestId('contract-deliver_by')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_rate')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_interval')).queryByTestId('modified-marker')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('contract-termination_clause')).queryByTestId('modified-marker')).not.toBeInTheDocument()
  })

  it('renders progress, reserve state, fines and fulfilment history', async () => {
    await renderDetail()
    expect(screen.getByText('45/200')).toBeInTheDocument()
    expect(screen.getByText(/Locked: 60,000/)).toBeInTheDocument()
    expect(screen.getByText('2,500 aUEC')).toBeInTheDocument()
    expect(screen.getByText('-45,000 aUEC')).toBeInTheDocument()
    expect(screen.getByText(/Area18/)).toBeInTheDocument()
  })

  it('shows Record fulfilment and Cancel order on in_progress, hides them on complete', async () => {
    const view = await renderDetail()
    expect(screen.getByRole('button', { name: /record fulfilment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeInTheDocument()
    view.unmount()

    mockApi({ ...DETAIL, order: { ...DETAIL.order, status: 'complete' } })
    render(<OrderDetail id="82" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Quantanium/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /record fulfilment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument()
  })

  it('Record fulfilment opens the FulfillmentModal stub', async () => {
    await renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /record fulfilment/i }))
    expect(screen.getByTestId('fulfillment-modal')).toBeInTheDocument()
  })

  it('Cancel order confirm calls cancelOrder', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /cancel order/i }))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/accountant/orders/82/cancel',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('notes are editable optimistically', async () => {
    await renderDetail()
    const textarea = screen.getByLabelText(/notes/i)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'renegotiated terms')
    await userEvent.click(screen.getByRole('button', { name: /save notes/i }))
    // Optimistic: the typed value stays put immediately, no blocking spinner.
    expect(textarea).toHaveValue('renegotiated terms')
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/accountant/orders/82',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ notes: 'renegotiated terms' }),
        }),
      ),
    )
  })
})
