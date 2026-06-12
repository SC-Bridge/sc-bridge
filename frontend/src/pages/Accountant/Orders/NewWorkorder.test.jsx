import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NewWorkorder from './NewWorkorder'

// Attach picker source: GET /orders?status=open. Order 90 is already attached
// to a workorder — it must be filtered out client-side (workorder_id !== null).
const OPEN_ORDERS = [
  { id: 82, type: 'sale', category: 'trading', tag: 'minerals', item: 'Laranite', quantity: 200, price_per_unit: 3200, total: 640000, status: 'open', workorder_id: null, fulfilledQty: 0 },
  { id: 90, type: 'purchase', category: 'production', tag: null, item: 'Hull plating', quantity: 1, price_per_unit: 1000, total: 1000, status: 'open', workorder_id: 3, fulfilledQty: 0 },
]

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi({ create = ok({ ok: true, id: 12 }), orders = OPEN_ORDERS } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts = {}) => {
    const s = String(url)
    if (opts.method === 'POST' && s.endsWith('/api/accountant/workorders')) return create
    if (s.includes('/api/accountant/orders')) return ok({ orders, total: orders.length, balance: 0, lockedInPOs: 0, page: 1 })
    return ok({})
  })
}

beforeEach(() => mockApi())
afterEach(() => vi.restoreAllMocks())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accountant/orders/workorders/new']}>
      <Routes>
        <Route path="/accountant/orders/workorders/new" element={<NewWorkorder />} />
        <Route path="/accountant/orders/workorders/:id" element={<div data-testid="wo-detail-route" />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function addInlineOrder({ type = null, category = 'trading', item = 'Refined quantanium', quantity = '10', price = '5000' } = {}) {
  const form = within(screen.getByTestId('inline-order-form'))
  if (type) await userEvent.click(form.getByLabelText(type))
  await userEvent.selectOptions(form.getByLabelText(/category/i), category)
  await userEvent.type(form.getByLabelText(/item/i), item)
  await userEvent.type(form.getByLabelText(/quantity/i), quantity)
  await userEvent.type(form.getByLabelText(/price/i), price)
  await userEvent.click(form.getByRole('button', { name: /add order/i }))
}

function postedBody() {
  const call = globalThis.fetch.mock.calls.find(
    ([u, o]) => String(u).endsWith('/api/accountant/workorders') && o?.method === 'POST',
  )
  return call ? JSON.parse(call[1].body) : null
}

describe('NewWorkorder composition route', () => {
  it('creates a draft with title + inline new order + attached existing order, then navigates to the detail', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/title/i), 'Laranite hauling run')

    // Attach picker offers ONLY standalone open orders (workorder_id === null).
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    expect(screen.queryByText('O-90')).not.toBeInTheDocument()
    expect(screen.queryByText('Hull plating')).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByTestId('attach-picker')).getByRole('checkbox'))

    await addInlineOrder()
    expect(within(screen.getByTestId('component-list')).getByText('Refined quantanium')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))
    await waitFor(() => expect(screen.getByTestId('wo-detail-route')).toBeInTheDocument())

    const sent = postedBody()
    expect(sent.title).toBe('Laranite hauling run')
    expect(sent.order_ids).toEqual([82])
    expect(sent.orders).toHaveLength(1)
    expect(sent.orders[0]).toMatchObject({
      type: 'sale', category: 'trading', item: 'Refined quantanium', quantity: 10, price_per_unit: 5000,
    })
    expect(sent.orders[0].start_at).toBeDefined()
    // Workorder-level contract defaults travel with the body.
    expect(sent.fine_interval).toBe('daily')
    expect(sent.fine_rate_type).toBe('percent')
    expect(sent.fine_rate).toBe(0.5)
    expect(sent.termination_clause).toBe('standard')
    // "None" rate change maps to omission, never '' (backend enum would 400).
    expect(sent).not.toHaveProperty('rate_change_condition')
    // Private market enforcement: visibility keys never leave the client.
    expect(Object.keys(sent).filter((k) => k.startsWith('vis_'))).toEqual([])
  })

  it('workorder-level contract section uses the same template + change marking', async () => {
    renderPage()
    expect(screen.queryAllByTestId('modified-marker')).toHaveLength(0)
    const fineRate = screen.getByLabelText(/fine rate$/i)
    await userEvent.clear(fineRate)
    await userEvent.type(fineRate, '1.5')
    expect(screen.getAllByTestId('modified-marker')).toHaveLength(1)
    expect(within(screen.getByTestId('contract-fine_rate')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_interval')).queryByTestId('modified-marker')).not.toBeInTheDocument()
  })

  it('creates a draft with a single inline component — the ≥2-open rule gates PUBLISH, not draft creation', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText(/title/i), 'Thin run')
    await addInlineOrder()

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))
    await waitFor(() => expect(screen.getByTestId('wo-detail-route')).toBeInTheDocument())

    const sent = postedBody()
    expect(sent.title).toBe('Thin run')
    expect(sent.orders).toHaveLength(1)
    expect(sent).not.toHaveProperty('order_ids')
  })

  it('fund rejection from an inline purchase bubbles the rejection panel', async () => {
    mockApi({
      create: {
        ok: false,
        status: 400,
        json: async () => ({ error: 'Insufficient funds', balance: 240000, lockedInPOs: 400000, required: 950000 }),
      },
    })
    renderPage()
    await userEvent.type(screen.getByLabelText(/title/i), 'Overreach')
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    await userEvent.click(within(screen.getByTestId('attach-picker')).getByRole('checkbox'))
    await addInlineOrder({ type: 'Purchase', category: 'production', item: 'Ship components', quantity: '95', price: '10000' })

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))
    const panel = await screen.findByTestId('fund-rejection')
    expect(panel).toHaveTextContent(/insufficient funds/i)
    expect(panel).toHaveTextContent('950,000')
    expect(panel).toHaveTextContent('240,000')
    expect(panel).toHaveTextContent('400,000')
    // Page stays put for correction.
    expect(screen.queryByTestId('wo-detail-route')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create draft/i })).toBeInTheDocument()
  })
})
