import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Loadout from './index'

const empty = { data: null, loading: false, error: null, refetch: vi.fn() }
const hooks = vi.hoisted(() => ({
  useOwnedModules: vi.fn(),
  useLoanerLoadout: vi.fn(),
  useModuleSelections: vi.fn(),
  useGadgetSelections: vi.fn(),
}))

vi.mock('../../hooks/useAPI', () => ({
  useShip: () => ({ ...empty, data: { id: 1, slug: 'carrack', name: 'Carrack' } }),
  useLoadoutComponents: () => empty,
  useShipModules: () => empty,
  useOwnedModules: (...args) => { hooks.useOwnedModules(...args); return empty },
  useFleetLoadout: () => empty,
  useLoadoutCart: () => empty,
  useFleet: () => ({
    ...empty,
    data: [
      { id: 5, vehicle_slug: 'carrack', rsi_account_id: 1 },
      { id: 6, vehicle_slug: 'carrack', rsi_account_id: 2 },
    ],
  }),
  useLoanerLoadout: (...args) => { hooks.useLoanerLoadout(...args); return empty },
  useModuleSelections: (...args) => { hooks.useModuleSelections(...args); return empty },
  useGadgetSelections: (...args) => { hooks.useGadgetSelections(...args); return empty },
  useStatus: () => ({ data: { features: { multiAccount: true } } }),
  useRsiAccounts: () => ({
    data: {
      accounts: [
        { id: 1, label: 'Main', color: '#22d3ee' },
        { id: 2, label: 'Alt', color: '#f97316' },
      ],
    },
  }),
  saveFleetLoadout: vi.fn(),
  resetFleetLoadout: vi.fn(),
  addToLoadoutCart: vi.fn(),
  saveLoanerLoadout: vi.fn(),
  resetLoanerLoadout: vi.fn(),
  saveModuleSelections: vi.fn(),
  resetModuleSelection: vi.fn(),
  saveGadgetSelections: vi.fn(),
  resetGadgetSelection: vi.fn(),
}))

const renderAt = (fleetId, search = `fleet_id=${fleetId}`) =>
  render(
    <MemoryRouter initialEntries={[`/loadout/carrack?${search}`]}>
      <Routes>
        <Route path="/loadout/:slug" element={<Loadout />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Loadout fleet entry marker', () => {
  it.each([[5, 'Main'], [6, 'Alt']])('fleet entry %i shows the %s marker and no filter bar', (id, name) => {
    renderAt(id)
    expect(screen.getByRole('img', { name })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /filter by rsi account/i })).toBeNull()
  })
})

describe('Loadout account scoping', () => {
  it('loaner mode sends the account param from the URL', () => {
    vi.clearAllMocks()
    renderAt(null, 'loaner_vehicle_id=7&account=3')
    expect(hooks.useLoanerLoadout).toHaveBeenCalledWith(7, 3)
    expect(hooks.useModuleSelections).toHaveBeenCalledWith('loaner', 7, 3)
    expect(hooks.useGadgetSelections).toHaveBeenCalledWith('loaner', 7, 3)
    expect(hooks.useOwnedModules).toHaveBeenCalledWith('carrack', 3)
  })

  it('fleet mode asks for the owned modules of its own account', () => {
    vi.clearAllMocks()
    renderAt(6)
    expect(hooks.useOwnedModules).toHaveBeenCalledWith('carrack', 2)
  })
})
