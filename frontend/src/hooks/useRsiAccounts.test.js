import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRsiAccounts } from './useAPI'

describe('useRsiAccounts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends no request when skipped (features.multiAccount off)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRsiAccounts({ skip: true }))
    expect(result.current.data).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches /api/rsi-accounts when not skipped', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ accounts: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRsiAccounts())
    await waitFor(() => expect(result.current.data).toEqual({ accounts: [] }))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rsi-accounts')
  })
})
