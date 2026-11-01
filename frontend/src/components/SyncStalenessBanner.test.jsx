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

function renderBanner() {
  return render(<MemoryRouter><SyncStalenessBanner /></MemoryRouter>)
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

  it('stays silent when the status request fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'boom', json: async () => ({ error: 'boom' }) }))
    const { container } = renderBanner()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
