import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import SyncDataSection from './SyncDataSection'

const base = { has_data: true, fleet_count: 3, buyback_count: 3, has_profile: true, last_synced: '2026-11-10 08:00:00' }
const accounts = [
  { id: 1, name: 'Main', color: '#22d3ee', is_primary: true, synced_at: '2026-05-15 11:40:02', ship_count: 2, pledge_count: 3, buyback_count: 1 },
  { id: 2, name: 'Beta', color: '#f97316', is_primary: false, synced_at: null, ship_count: 1, pledge_count: 0, buyback_count: 2 },
]

describe('SyncDataSection', () => {
  it('shows a per-account table with colour dot, name, counts and Never for an unsynced account', () => {
    render(<SyncDataSection syncStatus={{ ...base, accounts }} multiAccount onDelete={() => {}} notification={null} />)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    const main = within(rows[1])
    expect(main.getByText('Main')).toBeInTheDocument()
    expect(main.getByTestId('account-dot')).toHaveStyle({ backgroundColor: '#22d3ee' })
    expect(main.getByText('2')).toBeInTheDocument()
    expect(main.getByText('1')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Never')).toBeInTheDocument()
  })

  it('shows no account table with one account', () => {
    render(<SyncDataSection syncStatus={{ ...base, accounts: [accounts[0]] }} multiAccount onDelete={() => {}} notification={null} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Last synced')).toBeInTheDocument()
  })

  it('shows no account table when the multi-account flag is off', () => {
    render(<SyncDataSection syncStatus={{ ...base, accounts }} onDelete={() => {}} notification={null} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
