import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Import from './index'

const api = vi.hoisted(() => ({
  refetchSyncStatus: vi.fn(),
  refetchStatus: vi.fn(),
  sync: { status: 'idle' },
}))

vi.mock('../../hooks/useAPI', () => ({
  useStatus: () => ({ data: { vehicles: 51, features: { multiAccount: true } }, loading: false, error: null, refetch: api.refetchStatus }),
  usePreferences: () => ({ data: { sync_consent: '2026-11-01T00:00:00Z' }, loading: false, error: null, refetch: vi.fn() }),
  useUserSyncStatus: () => ({ data: { last_synced: '2026-11-16 12:24:00', accounts: [] }, loading: false, error: null, refetch: api.refetchSyncStatus }),
  useCharacters: () => ({ data: { characters: [] }, loading: false, error: null, refetch: vi.fn() }),
  setPreferences: vi.fn(),
  deleteSyncData: vi.fn(),
}))
vi.mock('../../hooks/useHangarSync', () => ({
  default: () => api.sync,
  SYNC_CATEGORIES: {},
}))
vi.mock('./SyncSection', () => ({ default: () => null }))
vi.mock('./SyncDataSection', () => ({ default: () => null }))
vi.mock('./SyncMappingDialog', () => ({ default: () => null }))
vi.mock('./CharacterBackup', () => ({ default: () => null }))
vi.mock('./LegacyImport', () => ({ default: () => null }))
vi.mock('./ExtensionSection', () => ({ default: () => null }))

const renderPage = () => render(<MemoryRouter><Import /></MemoryRouter>)

describe('Import page after a sync', () => {
  beforeEach(() => {
    api.refetchSyncStatus.mockClear()
    api.refetchStatus.mockClear()
    api.sync = { status: 'idle' }
  })

  it('reloads the sync data and ship count once a sync completes', () => {
    const { rerender } = renderPage()
    expect(api.refetchSyncStatus).not.toHaveBeenCalled()

    api.sync = { status: 'uploading' }
    rerender(<MemoryRouter><Import /></MemoryRouter>)
    expect(api.refetchSyncStatus).not.toHaveBeenCalled()

    api.sync = { status: 'complete', result: { ship_count: 51 } }
    rerender(<MemoryRouter><Import /></MemoryRouter>)
    expect(api.refetchSyncStatus).toHaveBeenCalledTimes(1)
    expect(api.refetchStatus).toHaveBeenCalledTimes(1)
  })

  it('reloads once per completed sync, not on every re-render', () => {
    api.sync = { status: 'complete', result: { ship_count: 51 } }
    const { rerender } = renderPage()
    rerender(<MemoryRouter><Import /></MemoryRouter>)
    expect(api.refetchSyncStatus).toHaveBeenCalledTimes(1)
  })
})
