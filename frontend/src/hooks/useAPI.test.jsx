import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePreferences, setPreferences } from './useAPI'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(payload, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  })
}

// Tier gating in the sidebar reads usePreferences; the Settings page saves via
// setPreferences. Without this announce/refetch pair the sidebar shows a stale
// tier until a full page reload (Lars, 2026-06-12).
describe('preferences live propagation', () => {
  it('setPreferences dispatches preferences:changed after a successful PUT', async () => {
    mockFetch({ ok: true })
    const heard = vi.fn()
    window.addEventListener('preferences:changed', heard)
    try {
      await setPreferences({ accountantTier: 'easy' })
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('preferences:changed', heard)
    }
  })

  it('does NOT dispatch preferences:changed when the PUT fails', async () => {
    mockFetch({ error: 'nope' }, false, 400)
    const heard = vi.fn()
    window.addEventListener('preferences:changed', heard)
    try {
      await expect(setPreferences({ accountantTier: 'easy' })).rejects.toThrow()
      expect(heard).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('preferences:changed', heard)
    }
  })

  it('usePreferences refetches when preferences:changed fires', async () => {
    const spy = mockFetch({ accountantTier: 'industrial' })
    const { result } = renderHook(() => usePreferences())
    await waitFor(() => expect(result.current.data?.accountantTier).toBe('industrial'))
    spy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ accountantTier: 'easy' }) })
    window.dispatchEvent(new Event('preferences:changed'))
    await waitFor(() => expect(result.current.data?.accountantTier).toBe('easy'))
  })

  it('usePreferences with skip does not fetch on preferences:changed', async () => {
    const spy = mockFetch({ accountantTier: 'industrial' })
    renderHook(() => usePreferences({ skip: true }))
    window.dispatchEvent(new Event('preferences:changed'))
    // allow any (incorrect) fetch to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).not.toHaveBeenCalled()
  })
})
