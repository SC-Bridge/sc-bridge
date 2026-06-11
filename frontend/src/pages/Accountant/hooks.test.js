import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLedger, useBadges, useSorting, addEntry, categorizeEntries } from './hooks'

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

describe('accountant hooks', () => {
  it('useLedger fetches with the given query string', async () => {
    const spy = mockFetch({ entries: [], total: 0, balance: 0, page: 1 })
    const { result } = renderHook(() => useLedger('category=trading'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(spy).toHaveBeenCalledWith('/api/accountant/ledger?category=trading', expect.any(Object))
    expect(result.current.data.total).toBe(0)
  })

  it('useBadges surfaces counts', async () => {
    mockFetch({ sorting: 7, loansDueSoon: 0, sortingThreshold: 10 })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.data?.sorting).toBe(7))
  })

  it('addEntry POSTs the body and returns the response', async () => {
    const spy = mockFetch({ ok: true, id: 12 })
    const res = await addEntry({ amount: -500, category: 'trading', occurred_at: '2026-06-01T00:00:00Z' })
    expect(res.id).toBe(12)
    expect(spy).toHaveBeenCalledWith('/api/accountant/ledger', expect.objectContaining({ method: 'POST' }))
  })

  it('categorizeEntries PUTs ids + category', async () => {
    const spy = mockFetch({ ok: true, updated: 2 })
    await categorizeEntries([1, 2], 'trading', 'minerals')
    expect(spy).toHaveBeenCalledWith('/api/accountant/sorting/bulk', expect.objectContaining({ method: 'PUT' }))
  })

  it('throws the server error message on failure', async () => {
    mockFetch({ error: 'Tag already exists' }, false, 409)
    await expect(addEntry({})).rejects.toThrow('Tag already exists')
  })

  it('useLedger without args fetches the bare ledger path', async () => {
    const spy = mockFetch({ entries: [], total: 0, balance: 0, page: 1 })
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(spy).toHaveBeenCalledWith('/api/accountant/ledger', expect.any(Object))
  })

  it('concurrent identical GETs share a single in-flight request', async () => {
    const spy = mockFetch({ sorting: 3, loansDueSoon: 0, sortingThreshold: 10 })
    const first = renderHook(() => useBadges())
    const second = renderHook(() => useBadges())
    await waitFor(() => expect(first.result.current.data?.sorting).toBe(3))
    await waitFor(() => expect(second.result.current.data?.sorting).toBe(3))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('useBadges refetches when accountant:changed fires', async () => {
    const spy = mockFetch({ sorting: 7, loansDueSoon: 0, sortingThreshold: 10 })
    const { result } = renderHook(() => useBadges())
    await waitFor(() => expect(result.current.data?.sorting).toBe(7))
    spy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sorting: 4, loansDueSoon: 0, sortingThreshold: 10 }) })
    window.dispatchEvent(new Event('accountant:changed'))
    await waitFor(() => expect(result.current.data?.sorting).toBe(4))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('mutations dispatch accountant:changed after they resolve', async () => {
    mockFetch({ ok: true, updated: 2 })
    const heard = vi.fn()
    window.addEventListener('accountant:changed', heard)
    try {
      await categorizeEntries([1, 2], 'trading', 'minerals')
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('accountant:changed', heard)
    }
  })

  it('useSorting refetches when accountant:changed fires', async () => {
    const spy = mockFetch({ entries: [], count: 5 })
    const { result } = renderHook(() => useSorting())
    await waitFor(() => expect(result.current.data?.count).toBe(5))
    spy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ entries: [], count: 2 }) })
    window.dispatchEvent(new Event('accountant:changed'))
    await waitFor(() => expect(result.current.data?.count).toBe(2))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
