import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Hangar from './Hangar'

const api = vi.hoisted(() => ({ items: [], accounts: [], multiAccount: true }))

vi.mock('../hooks/useAPI', () => ({
  useHangar: () => ({
    data: { items: api.items, counts: { Ship: 99 }, total: 99 },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useStatus: () => ({ data: { features: { multiAccount: api.multiAccount } } }),
  useRsiAccounts: () => ({ data: { accounts: api.accounts } }),
}))
vi.mock('../components/SyncStalenessBanner', () => ({ default: () => null }))

const item = (id, acct, kind, pledgeId, cents) => ({
  id,
  title: `Item ${id}`,
  kind,
  rsi_account_id: acct,
  pledge_id: pledgeId,
  pledge_is_reclaimable: 1,
  pledge_value_cents: cents,
  pledge_currency: 'USD',
})

const renderAt = (search) =>
  render(
    <MemoryRouter initialEntries={[`/hangar${search}`]}>
      <Hangar />
    </MemoryRouter>,
  )

describe('Hangar account filter', () => {
  beforeEach(() => {
    localStorage.clear()
    api.multiAccount = true
    api.accounts = [
      { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
      { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
    ]
    api.items = [
      item(1, 1, 'Ship', 10, 10000),
      item(2, 2, 'Ship', 20, 20000),
      item(3, 2, 'Skin', 21, 5000),
      item(4, 2, 'Skin', 22, 5000),
    ]
  })

  it('header count, kind chips and melt summary use only the selected account', () => {
    renderAt('?accts=2')
    expect(screen.getByText(/3 items/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All\s*· 3$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ship\s*· 1$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Paints\s*· 2$/ })).toBeInTheDocument()
    // account 2 melts 200 + 50 + 50 across 3 pledges; account 1's $100 is excluded
    expect(screen.getByText('$300')).toBeInTheDocument()
    expect(screen.getByText(/across 3 of 3 pledges/)).toBeInTheDocument()
  })

  it('with a single account every item is counted', () => {
    api.accounts = [api.accounts[0]]
    api.items = [item(1, 1, 'Ship', 10, 10000), item(2, 1, 'Skin', 11, 500)]
    renderAt('')
    expect(screen.getByText(/2 items/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ship\s*· 1$/ })).toBeInTheDocument()
  })
})
