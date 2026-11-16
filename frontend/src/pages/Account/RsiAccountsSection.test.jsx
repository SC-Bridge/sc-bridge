import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import RsiAccountsSection from './RsiAccountsSection'

const payload = {
  accounts: [
    { id: 1, label: 'Main', rsi_handle: 'Jean', display_name: 'Jean', is_primary: true, is_placeholder: false, verified: true, synced_at: null, ship_count: 7, pledge_count: 20, color: '#22d3ee' },
    { id: 2, label: null, rsi_handle: 'Alt', display_name: 'Alt', is_primary: false, is_placeholder: false, verified: true, synced_at: null, ship_count: 3, pledge_count: 5, color: '#f97316' },
  ],
  max: 10,
  can_add: true,
  palette: ['#22d3ee', '#f97316', '#a855f7', '#84cc16', '#f43f5e', '#eab308', '#3b82f6', '#10b981', '#ec4899', '#94a3b8'],
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

  it('shows a swatch per palette colour and saves the picked one', async () => {
    render(<RsiAccountsSection />)
    await screen.findByText('Alt', { selector: 'span' })
    const altRow = screen.getAllByRole('listitem')[1]
    const swatches = within(altRow).getAllByRole('button', { name: /^#/ })
    expect(swatches).toHaveLength(10)
    expect(within(altRow).getByRole('button', { name: '#f97316' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(altRow).getByRole('button', { name: '#10b981' }))
    await waitFor(() => {
      const patch = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      expect(patch[0]).toBe('/api/rsi-accounts/2')
      expect(JSON.parse(patch[1].body)).toEqual({ color: '#10b981' })
    })
  })
})
