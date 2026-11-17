import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HangarCleanup from './index'

const api = vi.hoisted(() => ({
  payload: null,
  respond: null,
  queries: [],
  multiAccount: false,
  rsiAccounts: null,
  saveCleanupDecision: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupDecisions: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupBuy: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupBuyRemelt: vi.fn(() => Promise.resolve({ ok: true })),
  removeCleanupBuy: vi.fn(() => Promise.resolve({ ok: true })),
  saveCleanupState: vi.fn(() => Promise.resolve({ ok: true })),
  resetCleanup: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('../../hooks/useAPI', () => ({
  useHangarCleanup: (query = '') => {
    api.queries.push(query)
    return api.respond ? api.respond(query) : { data: api.payload, loading: false, error: null, refetch: vi.fn() }
  },
  useStatus: () => ({ data: { features: { multiAccount: api.multiAccount } } }),
  useRsiAccounts: ({ skip = false } = {}) => ({ data: !skip && api.rsiAccounts ? { accounts: api.rsiAccounts } : null }),
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
  api.respond = null
  api.queries = []
  api.multiAccount = false
  api.rsiAccounts = null
  localStorage.clear()
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

  it('marks a limited paint and suggests reviewing it instead of melting', () => {
    api.payload = payload({ pledges: [pledgeHullD, { ...paint, rsi_pledge_id: 6, name: 'Fury - Best in Show 2953 Paint', items: [{ ...paint.items[0], title: 'Fury - Best in Show 2953 Paint' }] }] })
    renderPage()
    const ledger = screen.getByRole('region', { name: 'Ledger' })
    expect(within(ledger).getAllByText('Limited paint').length).toBeGreaterThan(0)
    expect(within(ledger).getByText('Review: limited paint')).toBeTruthy()
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

// ── Several RSI accounts ────────────────────────────────────────────────────

describe('HangarCleanup accounts', () => {
  const rsiAccounts = [
    { id: 1, label: 'Alpha', rsi_handle: 'alpha', color: '#22d3ee', is_primary: 1 },
    { id: 2, label: 'Beta', rsi_handle: 'beta', color: '#f97316', is_primary: 0 },
  ]
  const allAccounts = [{ id: 1, name: 'Alpha', color: '#22d3ee' }, { id: 2, name: 'Beta', color: '#f97316' }]
  const acct = (id, extra = {}) => ({
    id, name: id === 1 ? 'Alpha' : 'Beta', color: '#22d3ee', is_primary: id === 1, store_credit_cents: 5000 * id,
    synced_at: '2026-11-07T19:30:00Z', credit_override_cents: null, done_steps: [], buys: [], ...extra,
  })
  const fury = { ...paint, rsi_account_id: 1, is_giftable: true }
  const storm = { ...paint, rsi_pledge_id: 6, name: 'Paints - Storm - 3 Paint Pack', value_cents: 1785, rsi_account_id: 2, items: [{ ...paint.items[0], title: 'Storm - Landfall Paint' }] }
  const meltBoth = {
    5: { decision: 'melt', buy_ingame: false, iae_price_cents: null },
    6: { decision: 'melt', buy_ingame: false, iae_price_cents: null },
  }
  const multiPayload = (extra = {}) => payload({
    accounts: [acct(1), acct(2)], all_accounts: allAccounts, pledges: [fury, storm], decisions: meltBoth, ...extra,
  })
  const singlePayload = (id, extra = {}) => payload({
    accounts: [acct(id)], all_accounts: allAccounts, store_credit_cents: 5000 * id,
    pledges: [id === 1 ? fury : storm], decisions: { [id === 1 ? 5 : 6]: meltBoth[id === 1 ? 5 : 6] }, ...extra,
  })

  beforeEach(() => {
    api.multiAccount = true
    api.rsiAccounts = rsiAccounts
  })

  it('one account: writes carry its account id', async () => {
    api.payload = singlePayload(2)
    renderPage('/hangar-cleanup?accts=2&view=steps')
    expect(api.queries).toContain('?accounts=2')
    fireEvent.click(screen.getByLabelText('Mark step 1 done'))
    await waitFor(() => expect(api.saveCleanupState).toHaveBeenCalledWith({ done_steps: ['prep-check'], rsi_account_id: 2 }))
  })

  it('one account: buys and credit carry its account id', async () => {
    api.payload = singlePayload(2)
    renderPage('/hangar-cleanup?accts=2')
    fireEvent.click(screen.getByLabelText('Buy Anvil Carrack'))
    await waitFor(() => expect(api.saveCleanupBuy).toHaveBeenCalledWith(20, null, 2))
    fireEvent.click(screen.getByLabelText('Buy Anvil Carrack'))
    await waitFor(() => expect(api.removeCleanupBuy).toHaveBeenCalledWith(20, 2))
    const credit = screen.getByLabelText('Current store credit')
    expect(credit.value).toBe('100.00')
    fireEvent.change(credit, { target: { value: '12.00' } })
    fireEvent.blur(credit)
    await waitFor(() => expect(api.saveCleanupState).toHaveBeenCalledWith({ credit_override_cents: 1200, rsi_account_id: 2 }))
  })

  it('several accounts: shows a plan per account and a combined credit', () => {
    api.payload = multiPayload()
    renderPage('/hangar-cleanup?accts=all&view=steps')
    expect(api.queries).toContain('?accounts=all')
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeTruthy()
    expect(screen.getByText('Combined credit')).toBeTruthy()
    expect(screen.getByText('$150.00')).toBeTruthy()
    expect(screen.getByText('Store credit stays on its own account. This total is for reference only.')).toBeTruthy()
  })

  it('ticking a step on one account leaves the other', async () => {
    api.payload = multiPayload()
    renderPage('/hangar-cleanup?accts=all&view=steps')
    const [onA, onB] = screen.getAllByRole('checkbox', { name: /^Mark step 1 done/ })
    fireEvent.click(onA)
    await waitFor(() => expect(api.saveCleanupState).toHaveBeenCalledWith({ done_steps: ['prep-check'], rsi_account_id: 1 }))
    expect(api.saveCleanupState).toHaveBeenCalledTimes(1)
    expect(onA.checked).toBe(true)
    expect(onB.checked).toBe(false)
  })

  it('gift option lists only other accounts on giftable pledges', async () => {
    api.payload = multiPayload({ decisions: {} })
    renderPage('/hangar-cleanup?accts=all')
    const giftable = screen.getByLabelText('Decision for Fury - 7 Paint Pack')
    expect(within(giftable).getByRole('option', { name: 'Gift to Beta' })).toBeTruthy()
    expect(within(giftable).queryByRole('option', { name: 'Gift to Alpha' })).toBeNull()
    expect(within(screen.getByLabelText('Decision for Storm - 3 Paint Pack')).queryByRole('option', { name: /^Gift to/ })).toBeNull()
    fireEvent.change(giftable, { target: { value: 'gift:2' } })
    await waitFor(() => expect(api.saveCleanupDecision).toHaveBeenCalledWith(5, { decision: 'gift', buy_ingame: false, iae_price_cents: null, gift_to_account_id: 2 }))
  })

  it('marks each pledge row with its account', () => {
    api.payload = multiPayload()
    renderPage('/hangar-cleanup?accts=all')
    const ledger = screen.getByRole('region', { name: 'Ledger' })
    expect(within(ledger).getAllByRole('img', { name: 'Alpha' }).length).toBeGreaterThan(0)
    expect(within(ledger).getAllByRole('img', { name: 'Beta' }).length).toBeGreaterThan(0)
  })

  it('reset with several accounts names the count and sends the selection', async () => {
    api.payload = multiPayload()
    renderPage('/hangar-cleanup?accts=all')
    fireEvent.click(screen.getByRole('button', { name: 'Reset decisions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset Hangar Cleanup for 2 accounts?' }))
    await waitFor(() => expect(api.resetCleanup).toHaveBeenCalledWith('all'))
  })

  it('shows no account UI with one account, or with the flag off', () => {
    api.rsiAccounts = [rsiAccounts[0]]
    const { unmount } = renderPage()
    expect(screen.queryByRole('group', { name: 'Filter by RSI account' })).toBeNull()
    expect(screen.queryByText('Combined credit')).toBeNull()
    expect(api.queries.every((q) => q === '')).toBe(true)
    unmount()
    api.rsiAccounts = rsiAccounts
    api.multiAccount = false
    api.queries = []
    renderPage()
    expect(screen.queryByRole('group', { name: 'Filter by RSI account' })).toBeNull()
    expect(api.queries.every((q) => q === '')).toBe(true)
  })

  it('blocks a write right after the selection changes, until the new data arrives', async () => {
    const stale = singlePayload(1)
    api.respond = () => ({ data: stale, loading: false, error: null, refetch: vi.fn() })
    const { rerender } = renderPage('/hangar-cleanup?accts=1')
    const select = screen.getByLabelText('Decision for Fury - 7 Paint Pack')
    fireEvent.change(select, { target: { value: 'keep' } })
    await waitFor(() => expect(api.saveCleanupDecision).toHaveBeenCalledTimes(1))
    api.saveCleanupDecision.mockClear()

    // The user adds Beta; the hook still hands back the one-account data.
    fireEvent.click(screen.getByRole('checkbox', { name: /Beta/ }))
    expect(api.queries.at(-1)).toBe('?accounts=all')
    const staleSelect = screen.getByLabelText('Decision for Fury - 7 Paint Pack')
    expect(staleSelect.matches(':disabled')).toBe(true)
    fireEvent.change(staleSelect, { target: { value: 'melt' } })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.saveCleanupDecision).not.toHaveBeenCalled()

    const fresh = multiPayload({ decisions: {} })
    api.respond = () => ({ data: fresh, loading: false, error: null, refetch: vi.fn() })
    rerender(<MemoryRouter initialEntries={['/hangar-cleanup?accts=1']}><HangarCleanup /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText('Decision for Fury - 7 Paint Pack').matches(':disabled')).toBe(false))
    fireEvent.change(screen.getByLabelText('Decision for Fury - 7 Paint Pack'), { target: { value: 'melt' } })
    await waitFor(() => expect(api.saveCleanupDecision).toHaveBeenCalledWith(5, { decision: 'melt', buy_ingame: false, iae_price_cents: null }))
  })
})
