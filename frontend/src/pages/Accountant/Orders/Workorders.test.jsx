import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Workorders from './Workorders'

const WORKORDERS = [
  { id: 7, title: 'Laranite hauling run', status: 'in_progress', counterparty: '@vendor', componentCount: 4, completedCount: 2, netTotal: 412000 },
  { id: 3, title: 'Component restock', status: 'draft', counterparty: null, componentCount: 1, completedCount: 0, netTotal: -80000 },
]

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockApi({ workorders = WORKORDERS, total = workorders.length } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const s = String(url)
    if (s.includes('/api/accountant/workorders')) return ok({ workorders, total, page: 1 })
    return ok({})
  })
}

beforeEach(() => mockApi())
afterEach(() => vi.restoreAllMocks())

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <div data-testid="location-probe">{pathname}{search}</div>
}

function renderPage(entry = '/accountant/orders/workorders') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Workorders />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('Workorders list page', () => {
  it('lists workorders with W-ref, status pill, component count and net total', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    const table = within(screen.getByTestId('workorder-table'))
    expect(table.getByText('Laranite hauling run')).toBeInTheDocument()
    expect(table.getByText('In Progress')).toBeInTheDocument()
    expect(table.getByText('2/4')).toBeInTheDocument()
    expect(table.getByText(/\+412,000/)).toBeInTheDocument()
    // Negative net renders signed; draft row shows its plain component count.
    expect(table.getByText('W-0003')).toBeInTheDocument()
    expect(table.getByText('Draft')).toBeInTheDocument()
    expect(table.getByText(/-80,000/)).toBeInTheDocument()
  })

  it('status filter writes to the URL', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    const filters = within(screen.getByTestId('workorder-filters'))
    await userEvent.click(filters.getByLabelText('Draft'))
    expect(screen.getByTestId('location-probe').textContent).toContain('status=draft')
    await waitFor(() =>
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('status=draft'))).toBe(true),
    )
  })

  it('rows link to the workorder detail route', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    await userEvent.click(screen.getByText('W-0007'))
    expect(screen.getByTestId('location-probe').textContent).toContain('/accountant/orders/workorders/7')
  })

  it('[+ New Workorder] links to the composition route (route page, not a modal)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /new workorder/i })
    expect(link).toHaveAttribute('href', '/accountant/orders/workorders/new')
  })

  it('truly-unfiltered empty state renders the CTA hero linking to the composition route', async () => {
    mockApi({ workorders: [], total: 0 })
    renderPage()
    await waitFor(() => expect(screen.getByText(/no workorders yet/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /create your first workorder/i }))
      .toHaveAttribute('href', '/accountant/orders/workorders/new')
    expect(screen.queryByText(/no workorders match these filters/i)).not.toBeInTheDocument()
  })

  it('filtered empty state says no workorders match — no CTA hero', async () => {
    mockApi({ workorders: [], total: 0 })
    renderPage('/accountant/orders/workorders?status=terminated')
    await waitFor(() =>
      expect(screen.getByText(/no workorders match these filters/i)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: /create your first workorder/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/no workorders yet/i)).not.toBeInTheDocument()
  })

  it('loading renders the loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    // Unique query string: hooks.js dedupes in-flight GETs by path, so a
    // never-resolving fetch on the bare /workorders path would leak into later tests.
    renderPage('/accountant/orders/workorders?q=pending')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('error renders the message with retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false, status: 500, json: async () => ({ error: 'workorders exploded' }),
    }))
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('workorders exploded'))
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('hides the pager when workorders fit on one page', async () => {
    renderPage() // default mock: total 2
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
  })

  it('shows a pager when total exceeds the page size; Next drives the page param', async () => {
    mockApi({ total: 120 })
    renderPage()
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.getByTestId('location-probe').textContent).toContain('page=2')
    await waitFor(() =>
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('page=2'))).toBe(true),
    )
  })

  it('changing a filter resets pagination to page 1', async () => {
    mockApi({ total: 120 })
    renderPage('/accountant/orders/workorders?page=3')
    await waitFor(() => expect(screen.getByText('W-0007')).toBeInTheDocument())
    await userEvent.click(within(screen.getByTestId('workorder-filters')).getByLabelText('Draft'))
    expect(screen.getByTestId('location-probe').textContent).not.toContain('page=3')
  })
})
