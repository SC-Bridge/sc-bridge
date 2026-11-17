import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddIngameShipModal from './AddIngameShipModal'

const api = vi.hoisted(() => ({ accounts: [], filter: {}, multiAccount: true, addIngameShip: vi.fn() }))

vi.mock('../hooks/useAPI', () => ({
  useShips: () => ({ data: [{ id: 5, name: 'Carrack', manufacturer_name: 'Anvil' }] }),
  useStatus: () => ({ data: { features: { multiAccount: api.multiAccount } } }),
  useRsiAccounts: (opts) => ({ data: opts?.skip ? undefined : { accounts: api.accounts } }),
  addIngameShip: (...args) => api.addIngameShip(...args),
}))
vi.mock('../hooks/useAccountFilter', () => ({
  default: (accounts) => (accounts ? api.filter : { active: false, selectedIds: new Set() }),
}))

describe('AddIngameShipModal account picker', () => {
  beforeEach(() => {
    api.multiAccount = true
    api.addIngameShip.mockReset().mockResolvedValue({ ok: true })
    api.accounts = [
      { id: 1, label: 'Main', is_primary: 1 },
      { id: 2, label: 'Alt', is_primary: 0 },
    ]
    api.filter = { active: true, selectedIds: new Set([2]) }
  })

  it('shows the account picker only with 2+ accounts', () => {
    const { unmount } = render(<AddIngameShipModal onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: /account/i })).toBeInTheDocument()
    unmount()
    api.accounts = [api.accounts[0]]
    api.filter = { active: false, selectedIds: new Set() }
    render(<AddIngameShipModal onClose={() => {}} />)
    expect(screen.queryByRole('combobox', { name: /account/i })).toBeNull()
  })

  it('shows no picker when the multiAccount flag is off, even with 2 accounts', () => {
    api.multiAccount = false
    render(<AddIngameShipModal onClose={() => {}} />)
    expect(screen.queryByRole('combobox', { name: /account/i })).toBeNull()
  })

  it('defaults to the one selected account', async () => {
    render(<AddIngameShipModal onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: /account/i }).value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /add/i, hidden: false }))
    await waitFor(() => expect(api.addIngameShip).toHaveBeenCalledWith(5, undefined, 2))
  })

  it('defaults to the primary when several accounts are selected', () => {
    api.filter = { active: true, selectedIds: new Set([1, 2]) }
    render(<AddIngameShipModal onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: /account/i }).value).toBe('1')
  })
})
