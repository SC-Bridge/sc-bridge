import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LocalizationBuilder from './index'

const api = vi.hoisted(() => ({
  accounts: [],
  orderQueries: [],
  saveShipOrder: vi.fn(),
  config: { asopEnabled: true },
  order: { items: [{ vehicle_id: 7, vehicle_name: 'Carrack', custom_label: null, sort_position: 1 }, { vehicle_id: 8, vehicle_name: 'Idris', custom_label: null, sort_position: 2 }] },
  fleet: [],
  ships: [],
  refetch: () => {},
}))

vi.mock('../../hooks/useAPI', () => ({
  useLocalizationPreview: () => ({ data: null, loading: false }),
  useLocalizationConfig: () => ({ data: api.config, loading: false, refetch: api.refetch }),
  saveLocalizationConfig: vi.fn().mockResolvedValue({}),
  useLocalizationShipOrder: (query) => {
    api.orderQueries.push(query)
    return { data: api.order, loading: false, refetch: api.refetch }
  },
  saveLocalizationShipOrder: (...args) => api.saveShipOrder(...args),
  useFleet: () => ({ data: api.fleet }),
  useShips: () => ({ data: api.ships }),
  useStatus: () => ({ data: { features: { multiAccount: true } } }),
  useRsiAccounts: () => ({ data: { accounts: api.accounts } }),
}))
vi.mock('./WhatsChangedBanner', () => ({ default: () => null }))

const NOTE = 'Choose one account to rearrange its order. The download uses this combined order.'

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/localization${search}`]}>
      <LocalizationBuilder />
    </MemoryRouter>,
  )
}

describe('LocalizationBuilder ship order per account', () => {
  beforeEach(() => {
    localStorage.clear()
    api.orderQueries = []
    api.saveShipOrder = vi.fn().mockResolvedValue({})
    api.accounts = [
      { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
      { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ packs: [] }) }))
  })

  it("edits one account's order when one is selected", async () => {
    renderAt('?accts=2')
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(2)
    expect(api.orderQueries).toContain('?account=2')

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /^Save/ })[0])
    await waitFor(() => expect(api.saveShipOrder).toHaveBeenCalled())
    const [items, accountId] = api.saveShipOrder.mock.calls[0]
    expect(items.map((i) => i.vehicleId)).toEqual([8])
    expect(accountId).toBe(2)
  })

  it('shows the combined order read-only when several are selected', () => {
    renderAt('?accts=all')
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(screen.queryAllByLabelText('Drag to reorder')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /remove/i })).toHaveLength(0)
    expect(screen.getByText('Carrack')).toBeInTheDocument()
    expect(api.orderQueries).toContain('?accounts=all')
  })

  it('sends the selected accounts with the download', async () => {
    renderAt('?accts=all&section=preview')
    fireEvent.click(screen.getAllByRole('button', { name: /download/i })[0])
    await waitFor(() =>
      expect(fetch.mock.calls.some(([u]) => String(u) === '/api/localization/download?accounts=all')).toBe(true),
    )
  })
})
