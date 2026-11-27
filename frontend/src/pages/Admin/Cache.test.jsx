import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

let mockRole = 'super_admin'
vi.mock('../../lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'u1', role: mockRole } }, isPending: false }),
}))

import AdminCache from './Cache'

beforeAll(() => {
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

function confirmPurge() {
  fireEvent.click(screen.getByRole('button', { name: /^purge$/i }))
  const dialog = screen.getByRole('dialog', { hidden: true })
  fireEvent.click(within(dialog).getByRole('button', { name: /^purge$/i, hidden: true }))
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 403 ? 'Forbidden' : status === 500 ? 'Internal Server Error' : 'OK',
  json: async () => body,
})

describe('Admin Cache purge', () => {
  beforeEach(() => {
    mockRole = 'super_admin'
    global.fetch = vi.fn()
  })

  it('keeps purging with the returned cursor until the purge is complete', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { deleted: 899, complete: false, cursor: 'c1' }))
      .mockResolvedValueOnce(jsonResponse(200, { deleted: 899, complete: false, cursor: 'c2' }))
      .mockResolvedValueOnce(jsonResponse(200, { deleted: 202, complete: true, cursor: null }))
    render(<AdminCache />)
    confirmPurge()

    await waitFor(() => expect(screen.getByText('Purged 2000 keys')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledTimes(3)
    const bodies = global.fetch.mock.calls.map(([, opts]) => JSON.parse(opts.body))
    expect(bodies[0]).toEqual({ prefix: 'gd:' })
    expect(bodies[1]).toEqual({ prefix: 'gd:', cursor: 'c1' })
    expect(bodies[2]).toEqual({ prefix: 'gd:', cursor: 'c2' })
  })

  it('offers a Renders entry that purges the renders: prefix', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse(200, { deleted: 12, complete: true, cursor: null }))
    render(<AdminCache />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'renders:' } })
    expect(screen.getByRole('combobox').value).toBe('renders:')
    expect(screen.getByRole('option', { name: /renders/i })).toBeInTheDocument()
    confirmPurge()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ prefix: 'renders:' })
  })

  it('shows the HTTP status and server reason when the purge fails', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse(500, { error: 'KV list failed' }))
    render(<AdminCache />)
    confirmPurge()

    await waitFor(() => expect(screen.getByText(/Purge failed: HTTP 500/)).toBeInTheDocument())
    expect(screen.getByText(/KV list failed/)).toBeInTheDocument()
  })

  it('shows the status even when the failure body is not JSON', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 403, statusText: 'Forbidden',
      json: async () => { throw new SyntaxError('Unexpected token') },
    })
    render(<AdminCache />)
    confirmPurge()

    await waitFor(() => expect(screen.getByText(/Purge failed: HTTP 403 Forbidden/)).toBeInTheDocument())
  })

  it('reports keys already deleted when a later batch fails', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { deleted: 899, complete: false, cursor: 'c1' }))
      .mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
    render(<AdminCache />)
    confirmPurge()

    await waitFor(() => expect(screen.getByText(/Purge failed: HTTP 500/)).toBeInTheDocument())
    expect(screen.getByText(/899 keys deleted before the failure/)).toBeInTheDocument()
  })

  it('hides the purge control from admin accounts and says super_admin is required', () => {
    mockRole = 'admin'
    render(<AdminCache />)

    expect(screen.queryByRole('button', { name: /^purge$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/requires the super_admin role/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
