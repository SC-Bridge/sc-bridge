import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FleetTable from './FleetTable'

const api = vi.hoisted(() => ({ fleet: [], accounts: [], loaners: [] }))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

vi.mock('../hooks/useAPI', () => ({
  useFleet: () => ({ data: api.fleet, loading: false, error: null, refetch: vi.fn() }),
  useFleetLoaners: () => ({ data: api.loaners }),
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
    api.loaners = []
    navigate.mockClear()
  })

  it("gives each account's loaner row its own key and account link", () => {
    api.fleet = []
    api.loaners = [1, 2].map((acct) => ({
      vehicle_id: 7,
      vehicle_name: 'Mustang',
      vehicle_slug: 'mustang',
      production_status: 'flight_ready',
      is_derived_loaner: 1,
      loaner_for: 'Odin',
      rsi_account_id: acct,
    }))
    renderAt('?accts=all')
    expect(screen.getAllByText('Mustang')).toHaveLength(2)
    const buttons = screen.getAllByTitle('Customize loadout')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    const targets = navigate.mock.calls.map((c) => c[0])
    expect(targets.sort()).toEqual([
      '/loadout/mustang?loaner_vehicle_id=7&account=1',
      '/loadout/mustang?loaner_vehicle_id=7&account=2',
    ])
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

  it('clear in-game confirm counts every account, not just the filtered one', () => {
    api.fleet = [
      { ...ship(1, 1, 10, 10000), source: 'ingame' },
      { ...ship(2, 2, 20, 20000), source: 'ingame' },
      { ...ship(3, 2, 21, 30000), source: 'ingame' },
    ]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt('?accts=1')
    fireEvent.click(screen.getByRole('button', { name: /Clear In-Game \(3\)/ }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatch(/Remove all 3 in-game-purchased ships across all your RSI accounts/)
    confirm.mockRestore()
  })
})
