import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SyncStalenessBanner from './SyncStalenessBanner'

const NOW = Date.UTC(2026, 10, 2)
const DAY = 24 * 60 * 60 * 1000

function mockSyncStatus(body) {
  global.fetch = vi.fn((url) => {
    if (typeof url === 'string' && url.includes('/api/settings/sync-status')) {
      return Promise.resolve({ ok: true, json: async () => body })
    }
    return Promise.reject(new Error(`unmocked: ${url}`))
  })
}

function renderBanner(props = {}) {
  return render(<MemoryRouter><SyncStalenessBanner {...props} /></MemoryRouter>)
}

describe('SyncStalenessBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('warns when the last sync is months old and links to the Import page', async () => {
    mockSyncStatus({ has_data: true, has_profile: true, last_synced: '2026-05-15 11:40:02' })
    renderBanner()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/5 months ago/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /sync now/i })
    expect(link).toHaveAttribute('href', '/sync-import')
  })

  it('stays silent when the sync is recent', async () => {
    const twoDaysAgo = new Date(NOW - 2 * DAY).toISOString()
    mockSyncStatus({ has_data: true, has_profile: true, last_synced: twoDaysAgo })
    const { container } = renderBanner()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('stays silent for users who have never synced', async () => {
    mockSyncStatus({ has_data: true, has_profile: false, last_synced: null })
    const { container } = renderBanner()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  describe('with several accounts', () => {
    const accounts = [
      { id: 1, name: 'Stale Main', synced_at: '2026-05-15 11:40:02' },
      { id: 2, name: 'Fresh Alt', synced_at: new Date(NOW - 2 * DAY).toISOString() },
    ]
    const status = { has_data: true, has_profile: true, last_synced: accounts[1].synced_at, accounts }

    it('names only the stale account when both are selected', async () => {
      mockSyncStatus(status)
      renderBanner({ accountIds: new Set([1, 2]) })
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.getByText('Stale Main')).toBeInTheDocument()
      expect(screen.queryByText('Fresh Alt')).not.toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/5 months ago/)
    })

    it('judges every account when no selection is passed', async () => {
      mockSyncStatus(status)
      renderBanner()
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.getByText('Stale Main')).toBeInTheDocument()
    })

    it('stays silent when only the fresh account is selected', async () => {
      mockSyncStatus(status)
      const { container } = renderBanner({ accountIds: new Set([2]) })
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('keeps the single-account wording when the one account is stale', async () => {
    mockSyncStatus({
      has_data: true,
      has_profile: true,
      last_synced: '2026-05-15 11:40:02',
      accounts: [{ id: 1, name: 'Only', synced_at: '2026-05-15 11:40:02' }],
    })
    renderBanner({ accountIds: null })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/Your RSI hangar was last synced/)
  })

  it('stays silent when the status request fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'boom', json: async () => ({ error: 'boom' }) }))
    const { container } = renderBanner()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
