import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RsiAccountsSection from './RsiAccountsSection'

const payload = {
  accounts: [
    { id: 1, label: 'Main', rsi_handle: 'Jean', display_name: 'Jean', is_primary: true, is_placeholder: false, verified: true, synced_at: null, ship_count: 7, pledge_count: 20 },
    { id: 2, label: null, rsi_handle: 'Alt', display_name: 'Alt', is_primary: false, is_placeholder: false, verified: true, synced_at: null, ship_count: 3, pledge_count: 5 },
  ],
  max: 10,
  can_add: true,
}

describe('RsiAccountsSection', () => {
  beforeEach(() => {
    // jsdom has no <dialog> modal support; ConfirmDialog calls these.
    HTMLDialogElement.prototype.showModal = function () { this.open = true }
    HTMLDialogElement.prototype.close = function () { this.open = false }
    global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, status: 200, json: async () => payload }))
  })

  it('marks the primary row and offers Set as primary on the others', async () => {
    render(<RsiAccountsSection />)
    await screen.findByText('Main')
    expect(screen.getByText('RSI accounts')).toBeTruthy()
    expect(screen.getAllByText('Primary')).toHaveLength(1)
    expect(screen.getAllByText('Set as primary')).toHaveLength(1)
  })

  it('asks for confirmation naming the account and ship count before deleting', async () => {
    render(<RsiAccountsSection />)
    await screen.findByText('Alt', { selector: 'span' })
    fireEvent.click(screen.getAllByText('Delete')[1])
    expect(await screen.findByText(/Delete Alt and its 3 ships/)).toBeTruthy()
    expect(screen.getByText(/cannot be undone/)).toBeTruthy()
    expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)

    fireEvent.click(screen.getByText('Delete account'))
    await waitFor(() => {
      const del = global.fetch.mock.calls.find(([, o]) => o?.method === 'DELETE')
      expect(del[0]).toBe('/api/rsi-accounts/2')
      expect(del[1].body).toBe('{}')
    })
  })
})
