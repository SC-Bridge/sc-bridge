import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FleetTable from './FleetTable'

const api = vi.hoisted(() => ({ fleet: [], accounts: [] }))

vi.mock('../hooks/useAPI', () => ({
  useFleet: () => ({ data: api.fleet, loading: false, error: null, refetch: vi.fn() }),
  useFleetLoaners: () => ({ data: [] }),
  useUserOrgs: () => ({ data: { orgs: [] } }),
  useStatus: () => ({ data: { features: { multiAccount: true } } }),
  useRsiAccounts: () => ({ data: { accounts: api.accounts } }),
  updateShipVisibility: vi.fn(),
  bulkSetVisibility: vi.fn(),
  deleteIngameShip: vi.fn(),
  clearIngameShips: vi.fn(),
}))
vi.mock('../components/SyncStalenessBanner', () => ({ default: () => null }))
vi.mock('../components/ShareFleetBanner', () => ({ default: () => null }))
vi.mock('../components/ShipImage', () => ({ default: () => null }))
vi.mock('../components/CommunityTools', () => ({ default: () => null }))

const ship = (id, acct, pledgeId, cents) => ({
  id,
  vehicle_name: 'Carrack',
  vehicle_slug: 'carrack',
  production_status: 'flight_ready',
  rsi_account_id: acct,
  pledge_id: pledgeId,
  pledge_name: `Pledge ${pledgeId}`,
  pledge_is_reclaimable: 1,
  current_value_cents: cents,
  tags: [],
})

const totals = (text) =>
  screen.getByText((_, el) => el.tagName === 'P' && el.textContent.trim().startsWith(text))

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/fleet${search}`]}>
      <FleetTable />
    </MemoryRouter>,
  )
}

describe('FleetTable account filter', () => {
  beforeEach(() => {
    localStorage.clear()
    api.accounts = [
      { id: 1, label: 'Main', color: '#22d3ee', is_primary: 1 },
      { id: 2, label: 'Alt', color: '#f97316', is_primary: 0 },
    ]
    api.fleet = [ship(1, 1, 10, 10000), ship(2, 2, 20, 20000), ship(3, 2, 21, 30000)]
  })

  it('shows only the selected account and its totals', () => {
    renderAt('?accts=1')
    expect(screen.getAllByRole('img', { name: 'Main' })).toHaveLength(1)
    expect(screen.queryByRole('img', { name: 'Alt' })).toBeNull()
    expect(totals('$100 pledged across 1 pledges')).toBeInTheDocument()
  })

  it('accts=all shows every account and totals both', () => {
    renderAt('?accts=all')
    expect(screen.getAllByRole('img', { name: 'Main' })).toHaveLength(1)
    expect(screen.getAllByRole('img', { name: 'Alt' })).toHaveLength(2)
    expect(totals('$600 pledged across 3 pledges')).toBeInTheDocument()
  })

  it('same ship on two accounts renders two rows with different marker colours', () => {
    api.fleet = [ship(1, 1, 10, 10000), ship(2, 2, 20, 20000)]
    renderAt('?accts=all')
    expect(screen.getAllByText('Carrack')).toHaveLength(2)
    const main = screen.getByRole('img', { name: 'Main' })
    const alt = screen.getByRole('img', { name: 'Alt' })
    expect(main.style.backgroundColor).not.toBe(alt.style.backgroundColor)
    expect(totals('$300 pledged across 2 pledges')).toBeInTheDocument()
  })
})
