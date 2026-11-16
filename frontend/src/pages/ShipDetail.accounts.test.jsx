import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PledgeSection } from './ShipDetail'

const api = vi.hoisted(() => ({
  fleet: [
    { id: 1, vehicle_slug: 'carrack', rsi_account_id: 1, pledge_name: 'Pledge A' },
    { id: 2, vehicle_slug: 'carrack', rsi_account_id: 2, pledge_name: 'Pledge B' },
    { id: 3, vehicle_slug: 'aurora', rsi_account_id: 2, pledge_name: 'Other ship' },
  ],
}))

vi.mock('../hooks/useAPI', () => ({
  useShip: vi.fn(),
  useShipLoadout: vi.fn(),
  useShipPaints: vi.fn(),
  useShipSalvage: vi.fn(),
  useWeaponRacks: vi.fn(),
  useSuitLockers: vi.fn(),
  useFleet: () => ({ data: api.fleet }),
  useFleetEntryUpgrades: () => ({ data: null, loading: false }),
  useShipModules: vi.fn(),
  useOwnedModules: vi.fn(),
  useOwnedPaints: vi.fn(),
  useStatus: () => ({ data: { features: { multiAccount: true } } }),
  useRsiAccounts: () => ({
    data: {
      accounts: [
        { id: 1, label: 'Main', color: '#22d3ee' },
        { id: 2, label: 'Alt', color: '#f97316' },
      ],
    },
  }),
}))

describe('ShipDetail owned entries', () => {
  it('shows each owned entry with its account marker and no filter bar', () => {
    render(
      <MemoryRouter>
        <PledgeSection ship={{ slug: 'carrack' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Pledge A')).toBeInTheDocument()
    expect(screen.getByText('Pledge B')).toBeInTheDocument()
    expect(screen.queryByText('Other ship')).toBeNull()
    expect(screen.getByRole('img', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Alt' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /filter by rsi account/i })).toBeNull()
  })
})
