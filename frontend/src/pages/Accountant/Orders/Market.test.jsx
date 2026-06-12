import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Market from './Market'

const ORDERS = [
  { id: 82, type: 'sale', category: 'trading', tag: 'minerals', item: 'Laranite', quantity: 200, price_per_unit: 3200, total: 640000, status: 'open', deliver_by: null, fulfilledQty: 0, remaining: 200, accruedFines: 0, effectiveRate: 3200 },
  { id: 79, type: 'purchase', category: 'production', tag: null, item: 'Ship components', quantity: 4, price_per_unit: 20000, total: 80000, status: 'in_progress', deliver_by: '2026-06-30T00:00:00Z', fulfilledQty: 2, remaining: 2, accruedFines: 0, effectiveRate: 20000 },
]

const DETAIL = {
  order: { id: 82, type: 'sale', status: 'open', category: 'trading', tag: 'minerals', item: 'Laranite', quantity: 200, price_per_unit: 3200, total: 640000, counterparty: null, start_at: '2026-06-01T00:00:00Z', deliver_by: null, fine_interval: 'daily', fine_rate_type: 'percent', fine_rate: 0.5, rate_change_condition: null, rate_change_pct: 0, termination_clause: 'standard', workorder_id: null, modified_fields: [], notes: null },
  fulfillments: [],
  fines: [],
  reserve: { reserved: 0, released: 0, open: 0 },
  computed: { fulfilledQty: 0, remaining: 200, accruedFines: 0, effectiveRate: 3200 },
}

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi({ orders = ORDERS, total = orders.length, balance = 8240000, lockedInPOs = 4240293, badges = { ordersOverdue: 0 } } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const s = String(url)
    if (s.includes('/api/accountant/badges')) return ok(badges)
    if (/\/api\/accountant\/orders\/\d+/.test(s)) return ok(DETAIL)
    if (s.includes('/api/accountant/orders')) return ok({ orders, total, balance, lockedInPOs, page: 1 })
    return ok({})
  })
}

beforeEach(() => mockApi())

function LocationSearch() {
  const { search } = useLocation()
  return <div data-testid="location-search">{search}</div>
}

function renderMarket(entry = '/accountant/orders/market') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Market />
      <LocationSearch />
    </MemoryRouter>,
  )
}

describe('Market page', () => {
  it('renders order rows with type/category/qty/price and the O-ref', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    const table = within(screen.getByTestId('order-table'))
    expect(table.getByText('Laranite')).toBeInTheDocument()
    expect(table.getByText('Sales')).toBeInTheDocument()
    expect(table.getByText('Trading')).toBeInTheDocument()
    expect(table.getByText('3,200')).toBeInTheDocument()
    expect(table.getByText('640,000 aUEC')).toBeInTheDocument()
    expect(table.getByText('O-79')).toBeInTheDocument()
  })

  it('footer shows available balance and locked sum', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    expect(screen.getByText(/Available balance: 8,240,000/)).toBeInTheDocument()
    expect(screen.getByText(/locked in POs: 4,240,293/)).toBeInTheDocument()
  })

  it('filters write to the URL query string', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    const filters = within(screen.getByTestId('market-filters'))
    await userEvent.click(filters.getByLabelText('Sales'))
    expect(screen.getByTestId('location-search').textContent).toContain('type=sale')
    await waitFor(() =>
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('type=sale'))).toBe(true),
    )
  })

  it('shows the overdue banner when badges.ordersOverdue > 0', async () => {
    mockApi({ badges: { ordersOverdue: 2 } })
    renderMarket()
    await waitFor(() =>
      expect(screen.getByText(/2 orders past their delivery date/)).toBeInTheDocument(),
    )
  })

  it('hides the overdue banner at zero', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    expect(screen.queryByText(/past their delivery date/)).not.toBeInTheDocument()
  })

  it('truly-unfiltered empty state renders the CTA hero', async () => {
    mockApi({ orders: [], total: 0 })
    renderMarket()
    await waitFor(() => expect(screen.getByText(/no orders yet/i)).toBeInTheDocument())
    expect(screen.getByText(/create your first order/i)).toBeInTheDocument()
    expect(screen.queryByText(/no orders match these filters/i)).not.toBeInTheDocument()
  })

  it('filtered empty state says no orders match — no CTA hero', async () => {
    mockApi({ orders: [], total: 0 })
    renderMarket('/accountant/orders/market?type=sale')
    await waitFor(() =>
      expect(screen.getByText(/no orders match these filters/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/create your first order/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no orders yet/i)).not.toBeInTheDocument()
  })

  it('loading renders the loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      String(url).includes('/api/accountant/badges')
        ? Promise.resolve(ok({ ordersOverdue: 0 }))
        : new Promise(() => {}),
    )
    // Unique query string: hooks.js dedupes in-flight GETs by path, so a
    // never-resolving fetch on the bare /orders path would leak into later tests.
    renderMarket('/accountant/orders/market?q=pending')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('error renders the message with retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'orders exploded' }),
    }))
    renderMarket()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('orders exploded'))
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('clicking a row opens the OrderDetail slide-over via ?order=', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    await userEvent.click(screen.getByText('O-82'))
    expect(screen.getByTestId('location-search').textContent).toContain('order=82')
    expect(screen.getByTestId('order-detail')).toBeInTheDocument()
  })

  it('[+ New Order] button opens the NewOrderModal stub', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /new order/i }))
    expect(screen.getByTestId('new-order-modal')).toBeInTheDocument()
  })

  it('renders NO market tab strip this cycle (Private is implicit)', async () => {
    renderMarket()
    await waitFor(() => expect(screen.getByText('O-82')).toBeInTheDocument())
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
    expect(screen.queryByText('Corporation')).not.toBeInTheDocument()
    expect(screen.queryByText('Public')).not.toBeInTheDocument()
  })
})
