import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HangarCleanup from './index'

const api = vi.hoisted(() => ({
  payload: null,
  saveCleanupDecision: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupDecisions: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupBuy: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupBuyRemelt: vi.fn(() => Promise.resolve({ ok: true })),
  removeCleanupBuy: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupState: vi.fn(() => Promise.resolve({ ok: true })),
  resetCleanup: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('../../hooks/useAPI', () => ({
  useHangarCleanup: () => ({ data: api.payload, loading: false, error: null, refetch: vi.fn() }),
  useShips: () => ({ data: [
    { id: 10, slug: 'misc-hull-d', name: 'MISC Hull D', manufacturer_name: 'Musashi Industrial & Starflight Concern', focus: 'Transporter', classification: 'Heavy Freight', pledge_price: 550, price_auec: null, is_pledgeable: 1 },
    { id: 20, slug: 'anvl-carrack', name: 'Anvil Carrack', manufacturer_name: 'Anvil Aerospace', focus: 'Exploration', classification: 'Expedition', pledge_price: 600, price_auec: 34398000, is_pledgeable: 1 },
  ] }),
  saveCleanupDecision: api.saveCleanupDecision,
  saveCleanupDecisions: api.saveCleanupDecisions,
  saveCleanupBuy: api.saveCleanupBuy,
  saveCleanupBuyRemelt: api.saveCleanupBuyRemelt,
  removeCleanupBuy: api.removeCleanupBuy,
  saveCleanupState: api.saveCleanupState,
  resetCleanup: api.resetCleanup,
}))
vi.mock('../../components/SyncStalenessBanner', () => ({ default: () => null }))

const pledgeHullD = {
  rsi_pledge_id: 4, name: 'Standalone Ship - MISC Hull C - IAE 2949', value_cents: 30500, currency: 'Store Credit', date: '2026-01-01',
  is_reclaimable: true, is_giftable: false, is_upgraded: true, is_warbond: false, ccu_from: null, ccu_to: null,
  items: [
    { title: '120 Month Insurance', kind: 'Insurance', manufacturer_name: null, custom_name: null, insurance_months: 120, insurance_lifetime: false },
    { title: 'Hull D', kind: 'Ship', manufacturer_name: 'MISC', custom_name: null, insurance_months: null, insurance_lifetime: false },
  ],
  upgrades: [{ name: 'Upgrade - Hull C to Hull D, new value: $305.00 USD', applied_at: null, new_value_cents: 30500 }],
  ships: [{ vehicle_id: 10, slug: 'misc-hull-d', name: 'MISC Hull D', focus: 'Transporter', classification: 'Heavy Freight', pledge_price_cents: 55000, price_auec: null, insurance_label: '120 Month', insurance_months: 120, insurance_lifetime: false, warbond: false }],
}
const paint = {
  rsi_pledge_id: 5, name: 'Paints - Fury - 7 Paint Pack', value_cents: 2480, currency: 'Store Credit', date: null,
  is_reclaimable: true, is_giftable: false, is_upgraded: false, is_warbond: false, ccu_from: null, ccu_to: null,
  items: [{ title: 'Fury - Black Star Paint', kind: 'Skin', manufacturer_name: null, custom_name: null, insurance_months: null, insurance_lifetime: false }],
  upgrades: [], ships: [],
}

function payload(extra = {}) {
  return {
    synced_at: '2026-11-07T19:30:00Z', store_credit_cents: 7795,
    pledges: [pledgeHullD, paint], buybacks: [],
    decisions: {}, buys: [], state: { credit_override_cents: null, done_steps: [] },
    ...extra,
  }
}

const renderPage = (path = '/hangar-cleanup') => render(<MemoryRouter initialEntries={[path]}><HangarCleanup /></MemoryRouter>)

beforeEach(() => {
  api.payload = payload()
  vi.clearAllMocks()
})

describe('HangarCleanup page', () => {
  it('shows the ship by name with its role, base hull and store credit', () => {
    renderPage()
    const ledger = screen.getByRole('region', { name: 'Ledger' })
    expect(within(ledger).getByText('Hull D')).toBeTruthy()
    expect(within(ledger).getByText('Transporter · Heavy Freight')).toBeTruthy()
    expect(within(ledger).getByText('Hull C')).toBeTruthy()
    expect(screen.getByLabelText('Current store credit').value).toBe('77.95')
  })

  it('saves a decision to the account and counts it as a planned melt', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Decision for Fury - 7 Paint Pack'), { target: { value: 'melt' } })
    await waitFor(() => expect(api.saveCleanupDecision).toHaveBeenCalledWith(5, { decision: 'melt', buy_ingame: false, iae_price_cents: null }))
    const planned = screen.getByText('Planned melts').closest('.stat-card')
    expect(within(planned).getByText('$24.80')).toBeTruthy()
    expect(within(planned).getByText('1 pledge')).toBeTruthy()
  })

  it('adds a ship to the IAE buy list and saves it', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Buy Anvil Carrack'))
    await waitFor(() => expect(api.saveCleanupBuy).toHaveBeenCalledWith(20, null))
    expect(screen.getByText(/Buy list:/)).toBeTruthy()
  })

  it('offers "rebuy and remelt for buyback token" on a ship pledge and plans all three steps', async () => {
    renderPage()
    const select = screen.getByLabelText('Decision for Hull D')
    expect(within(select).getByRole('option', { name: 'Melt, rebuy at IAE, remelt for buyback token' })).toBeTruthy()
    expect(within(screen.getByLabelText('Decision for Fury - 7 Paint Pack')).queryByRole('option', { name: /remelt for buyback token/ })).toBeNull()
    fireEvent.change(select, { target: { value: 'iae-remelt' } })
    await waitFor(() => expect(api.saveCleanupDecision).toHaveBeenCalledWith(4, { decision: 'iae-remelt', buy_ingame: false, iae_price_cents: null }))
    // Melt +$305, rebuy -$550, remelt +$550: credit after = 77.95 + 305.
    expect(within(screen.getByText('Credit after').closest('.stat-card')).getByText('$382.95')).toBeTruthy()
  })

  it('lets a buy-list ship be bought and immediately remelted for a buyback token', async () => {
    api.payload = payload({ buys: [{ vehicle_id: 20, price_cents: null }] })
    renderPage()
    const select = screen.getByLabelText('After buying Anvil Carrack')
    expect(within(select).getByRole('option', { name: 'Buy and immediately remelt for buyback token' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'remelt' } })
    await waitFor(() => expect(api.saveCleanupBuyRemelt).toHaveBeenCalledWith(20, true))
    // Buy -$600 then remelt +$600: credit is unchanged.
    expect(within(screen.getByText('Credit after').closest('.stat-card')).getByText('$77.95')).toBeTruthy()
  })

  it('restores a saved remelt buy and adds the Exchange step after the purchase', () => {
    api.payload = payload({ buys: [{ vehicle_id: 20, price_cents: null, remelt: true }] })
    renderPage('/hangar-cleanup?view=steps')
    expect(screen.getByText('Buy Anvil Carrack (standalone, 120-month insurance)')).toBeTruthy()
    expect(screen.getByText('Exchange the new Anvil Carrack straight away')).toBeTruthy()
  })

  it('applies one decision to every pledge shown, after a confirming second click', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Decision for all shown pledges'), { target: { value: 'melt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 shown' }))
    expect(api.saveCleanupDecisions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Click again to set 2 pledges to Melt' }))
    await waitFor(() => expect(api.saveCleanupDecisions).toHaveBeenCalledWith([4, 5], 'melt'))
    expect(api.saveCleanupDecision).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Decision for Hull D').value).toBe('melt')
    expect(screen.getByLabelText('Decision for Fury - 7 Paint Pack').value).toBe('melt')
    expect(within(screen.getByText('Planned melts').closest('.stat-card')).getByText('2 pledges')).toBeTruthy()
  })

  it('bulk-applies only to the pledges matching the current filter', async () => {
    renderPage()
    fireEvent.click(within(screen.getByRole('region', { name: 'Ledger' })).getByRole('button', { name: /^Paint\s*\d+$/ }))
    fireEvent.change(screen.getByLabelText('Decision for all shown pledges'), { target: { value: 'keep' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 shown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Click again to set 1 pledge to Keep' }))
    await waitFor(() => expect(api.saveCleanupDecisions).toHaveBeenCalledWith([5], 'keep'))
  })

  it('bulk IAE rebuy skips pledges that are not ships', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Decision for all shown pledges'), { target: { value: 'iae' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 shown' }))
    fireEvent.click(screen.getByRole('button', { name: /^Click again to set 1 pledge to/ }))
    await waitFor(() => expect(api.saveCleanupDecisions).toHaveBeenCalledWith([4], 'iae'))
    expect(screen.getByLabelText('Decision for Fury - 7 Paint Pack').value).toBe('')
  })

  it('restores saved decisions and turns them into steps', () => {
    api.payload = payload({ decisions: { 4: { decision: 'iae', buy_ingame: false, iae_price_cents: null } } })
    renderPage('/hangar-cleanup?view=steps')
    expect(screen.getByText('Exchange “Hull D”')).toBeTruthy()
    expect(screen.getByText('Buy Hull D (standalone, 120-month insurance)')).toBeTruthy()
  })

  it('shows a way to sync when there is no synced hangar', () => {
    api.payload = payload({ pledges: [] })
    renderPage()
    expect(screen.getByText(/No synced hangar yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Sync & Import' })).toBeTruthy()
  })

  it('analyses an uploaded export without saving anything to the account', async () => {
    const { container } = renderPage()
    const file = new File([JSON.stringify({
      account: { nickname: 'Friend', store_credit_cents: 50000 },
      export_meta: { extension_version: '0.6.2' },
      pledges: [{ id: 77, name: 'Paints - Storm - 3 Paint Pack', valueCents: 1785, is_reclaimable: true, items: [{ title: 'Storm - Landfall Paint', kind: 'Skin' }] }],
    })], 'export.json', { type: 'application/json' })
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(/Viewing an export file for Friend/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Decision for Storm - 3 Paint Pack'), { target: { value: 'melt' } })
    expect(api.saveCleanupDecision).not.toHaveBeenCalled()
  })
})
