import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import WorkorderDetail from './WorkorderDetail'

// Fixture per the UX B.5 thumbnail — four components, mixed progress.
const COMPONENTS = [
  { id: 1, type: 'purchase', category: 'production', item: 'Hull plating', quantity: 4, price_per_unit: 1000, total: 4000, status: 'complete', workorder_id: 7, fulfilledQty: 4, remaining: 0, incurred: 4000, modified_fields: [] },
  { id: 2, type: 'purchase', category: 'production', item: 'Power relays', quantity: 2, price_per_unit: 1000, total: 2000, status: 'complete', workorder_id: 7, fulfilledQty: 2, remaining: 0, incurred: 2000, modified_fields: [] },
  { id: 3, type: 'sale', category: 'trading', item: 'Laranite', quantity: 200, price_per_unit: 3200, total: 640000, status: 'in_progress', workorder_id: 7, fulfilledQty: 45, remaining: 155, incurred: 0, modified_fields: [] },
  { id: 4, type: 'sale', category: 'trading', item: 'Agricium', quantity: 300, price_per_unit: 2000, total: 600000, status: 'open', workorder_id: 7, fulfilledQty: 0, remaining: 300, incurred: 0, modified_fields: [] },
]

// Two still-open components — enough to satisfy the publish gate.
const TWO_OPEN = [
  { id: 1, type: 'purchase', category: 'production', item: 'Hull plating', quantity: 4, price_per_unit: 1000, total: 4000, status: 'open', workorder_id: 7, fulfilledQty: 0, remaining: 4, incurred: 0, modified_fields: [] },
  { id: 2, type: 'sale', category: 'trading', item: 'Laranite', quantity: 200, price_per_unit: 3200, total: 640000, status: 'open', workorder_id: 7, fulfilledQty: 0, remaining: 200, incurred: 0, modified_fields: [] },
]

function workorder(overrides = {}) {
  return {
    id: 7, title: 'Laranite hauling run', description: null, counterparty: '@vendor',
    status: 'in_progress', start_at: '2026-06-01T00:00:00.000Z', deliver_by: '2026-06-15T00:00:00.000Z',
    // fine_interval deviates from the template ON PURPOSE while staying out of
    // modified_fields — a regression to client-side recompute (§5.1 failure
    // mode) would mark it and fail the no-marker pin below.
    fine_interval: 'weekly', fine_rate_type: 'percent', fine_rate: 0.5,
    rate_change_condition: null, rate_change_pct: 0, termination_clause: 'standard',
    modified_fields: ['deliver_by'], terminated_by: null, termination_note: null,
    completed_at: null, created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

// Attach picker source — order 90 is already attached elsewhere and must be
// filtered out client-side (workorder_id !== null).
const OPEN_STANDALONE = [
  { id: 82, type: 'sale', category: 'trading', item: 'Quantanium', quantity: 10, price_per_unit: 5000, total: 50000, status: 'open', workorder_id: null, fulfilledQty: 0 },
  { id: 90, type: 'purchase', category: 'production', item: 'Hull plating spare', quantity: 1, price_per_unit: 1000, total: 1000, status: 'open', workorder_id: 3, fulfilledQty: 0 },
]

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi({
  wo = workorder(),
  components = COMPONENTS,
  netFulfilled = 412000,
  openOrders = OPEN_STANDALONE,
  mutation = ok({ ok: true }),
} = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts = {}) => {
    const s = String(url)
    if (opts.method && opts.method !== 'GET') return mutation
    if (s.includes('/api/accountant/workorders/')) {
      return ok({
        workorder: wo,
        components,
        summaryPreview: { netFulfilled },
        settlementPreview: { suggestion: components.reduce((sum, o) => sum + o.incurred, 0) },
      })
    }
    if (s.includes('/api/accountant/orders')) {
      return ok({ orders: openOrders, total: openOrders.length, balance: 0, lockedInPOs: 0, page: 1 })
    }
    return ok({})
  })
}

beforeEach(() => mockApi())
afterEach(() => vi.restoreAllMocks())

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <div data-testid="location-probe">{pathname}{search}</div>
}

function renderPage(id = 7) {
  return render(
    <MemoryRouter initialEntries={[`/accountant/orders/workorders/${id}`]}>
      <Routes>
        <Route path="/accountant/orders/workorders/:id" element={<WorkorderDetail />} />
        <Route path="/accountant/orders/market" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mutationCalled(path, method) {
  return globalThis.fetch.mock.calls.some(
    ([u, o]) => String(u).endsWith(path) && o?.method === method,
  )
}

describe('WorkorderDetail route page', () => {
  it('renders component table with per-order type/category/status/progress (45/200 form)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())

    const table = within(screen.getByTestId('order-table'))
    expect(table.getByText('Laranite')).toBeInTheDocument()
    expect(table.getAllByText('Sales')).toHaveLength(2)
    expect(table.getAllByText('Purchase')).toHaveLength(2)
    expect(table.getAllByText('Trading')).toHaveLength(2)
    expect(table.getByText('In Progress')).toBeInTheDocument()
    expect(table.getAllByText('Complete')).toHaveLength(2)
    expect(table.getByText('45/200')).toBeInTheDocument()
    // Untouched open component shows its plain quantity.
    expect(table.getByText('300')).toBeInTheDocument()

    // Contract panel carries the change markers from the workorder row.
    expect(within(screen.getByTestId('contract-deliver_by')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_rate')).queryByTestId('modified-marker')).not.toBeInTheDocument()
    // STORED modified_fields, never recomputed: fine_interval deviates from
    // the template in the fixture yet must carry no marker.
    expect(within(screen.getByTestId('contract-fine_interval')).queryByTestId('modified-marker')).not.toBeInTheDocument()

    // Rows deep-link into the Market slide-over.
    await userEvent.click(table.getByText('Laranite'))
    expect(screen.getByTestId('location-probe').textContent).toBe('/accountant/orders/market?order=3')
  })

  it('draft: shows [Publish] (disabled hint under 2 components), attach/detach controls; published: detach hidden', async () => {
    // One open component — publish gate not met.
    mockApi({ wo: workorder({ status: 'draft', counterparty: null }), components: [TWO_OPEN[0]] })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled()
    expect(screen.getByText(/at least 2 open component/i)).toBeInTheDocument()
    // Draft components are detached, never cancelled/fulfilled — say so.
    expect(screen.getByText(/detach them instead/i)).toBeInTheDocument()

    // Attach controls list ONLY standalone open orders (workorder_id === null).
    const attach = await screen.findByTestId('attach-section')
    expect(within(attach).getByText('O-82')).toBeInTheDocument()
    expect(within(attach).queryByText('O-90')).not.toBeInTheDocument()
    await userEvent.click(within(attach).getByRole('button', { name: /attach/i }))
    await waitFor(() => expect(mutationCalled('/api/accountant/workorders/7/orders', 'POST')).toBe(true))

    // Detach control per component hits the detach endpoint.
    await userEvent.click(screen.getByRole('button', { name: /detach/i }))
    await waitFor(() => expect(mutationCalled('/api/accountant/workorders/7/orders/1', 'DELETE')).toBe(true))

    // Published: composition is frozen — no detach, no attach section.
    cleanup()
    mockApi({ wo: workorder({ status: 'open' }), components: TWO_OPEN })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /detach/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('attach-section')).not.toBeInTheDocument()
  })

  it('in_progress: shows [Terminate…]; draft/open: shows [Cancel]', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /terminate/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel workorder/i })).not.toBeInTheDocument()
    // Opens the modal.
    await userEvent.click(screen.getByRole('button', { name: /terminate/i }))
    expect(screen.getByRole('heading', { name: /terminate · w-0007/i })).toBeInTheDocument()
    // Full-termination prefill is the SERVER's settlementPreview.suggestion
    // verbatim (6,000 — the two COMPLETED components' incurred). A client
    // recompute over the still-open components would show 0.
    expect(screen.getByLabelText(/settlement amount/i)).toHaveValue(6000)

    cleanup()
    mockApi({ wo: workorder({ status: 'draft' }), components: TWO_OPEN })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /cancel workorder/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminate/i })).not.toBeInTheDocument()

    cleanup()
    mockApi({ wo: workorder({ status: 'open' }), components: TWO_OPEN })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /cancel workorder/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminate/i })).not.toBeInTheDocument()
  })

  it('complete: shows the summary line (net from summaryPreview) and completed_at', async () => {
    mockApi({
      wo: workorder({ status: 'complete', completed_at: '2026-06-10T12:00:00.000Z' }),
      netFulfilled: 412000,
    })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    const summary = screen.getByTestId('wo-summary')
    expect(summary).toHaveTextContent('412,000 aUEC')
    expect(summary).toHaveTextContent(new Date('2026-06-10T12:00:00.000Z').toLocaleDateString())
    // Closed — no actions.
    expect(screen.queryByRole('button', { name: /terminate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel workorder/i })).not.toBeInTheDocument()
  })

  it('terminated: renders the termination note + terminated_by banner', async () => {
    mockApi({
      wo: workorder({ status: 'terminated', terminated_by: 'counterparty', termination_note: 'dropped this leg' }),
    })
    renderPage()
    const banner = await screen.findByTestId('termination-banner')
    expect(banner).toHaveTextContent(/terminated by counterparty/i)
    expect(banner).toHaveTextContent('dropped this leg')
    expect(screen.queryByRole('button', { name: /terminate/i })).not.toBeInTheDocument()
  })

  it('publish/cancel actions call their hooks pessimistically', async () => {
    mockApi({ wo: workorder({ status: 'draft' }), components: TWO_OPEN })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    const publish = screen.getByRole('button', { name: /publish/i })
    expect(publish).toBeEnabled()
    await userEvent.click(publish)
    await waitFor(() => expect(mutationCalled('/api/accountant/workorders/7/publish', 'POST')).toBe(true))

    // Failure surfaces the server echo — no optimistic state flip.
    cleanup()
    mockApi({
      wo: workorder({ status: 'draft' }),
      components: TWO_OPEN,
      mutation: { ok: false, status: 400, json: async () => ({ error: 'A workorder needs at least 2 open component orders to publish' }) },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /publish/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 open component orders/i),
    )

    cleanup()
    mockApi({ wo: workorder({ status: 'open' }), components: TWO_OPEN })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText(/W-0007/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /cancel workorder/i }))
    await waitFor(() => expect(mutationCalled('/api/accountant/workorders/7/cancel', 'POST')).toBe(true))
  })

  it('loading renders the loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    // Unique id: hooks.js dedupes in-flight GETs by path, so a never-resolving
    // fetch on /workorders/7 would leak into later tests.
    renderPage(999)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('error renders the message with retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'workorder exploded' }),
    }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('workorder exploded'))
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
