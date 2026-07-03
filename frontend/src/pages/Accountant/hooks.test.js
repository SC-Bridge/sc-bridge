import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLedger, useBadges, useSorting, addEntry, categorizeEntries, useLoans, useLoan, createLoan, updateLoan, recordRepayment, settleLoan, useOrders, createOrder, recordFulfillment, terminateWorkorder, forgiveLoan } from './hooks'

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
    await categorizeEntries([1, 2], 'trading', { tag: 'minerals' })
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
      await categorizeEntries([1, 2], 'trading', { tag: 'minerals' })
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

describe('loan hooks', () => {
  it('useLoans GETs /api/accountant/loans', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ loans: [] }),
    })
    const { result } = renderHook(() => useLoans())
    await waitFor(() => expect(result.current.data).toEqual({ loans: [] }))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/accountant/loans'),
      expect.any(Object),
    )
  })

  it('createLoan POSTs and announces accountant:changed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, id: 1 }) })
    const spy = vi.fn()
    window.addEventListener('accountant:changed', spy)
    await createLoan({ direction: 'outgoing', counterparty: '@x', principal: 1000, interest_rate: 5, interest_interval: 'monthly', started_at: '2026-06-01T00:00:00Z' })
    expect(spy).toHaveBeenCalled()
    window.removeEventListener('accountant:changed', spy)
  })

  it('recordRepayment POSTs to /loans/:id/repayments', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, settled: false, outstanding: 60000 }) })
    await recordRepayment(7, { amount: 40000, occurred_at: '2026-06-10T00:00:00Z' })
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/loans/7/repayments', expect.objectContaining({ method: 'POST' }))
  })
})

describe('order + workorder hooks (M5)', () => {
  it('useOrders fetches with the given query string', async () => {
    const spy = mockFetch({ orders: [], total: 0, balance: 0, lockedInPOs: 0, page: 1 })
    const { result } = renderHook(() => useOrders('type=sale'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(spy).toHaveBeenCalledWith('/api/accountant/orders?type=sale', expect.any(Object))
    expect(result.current.data.total).toBe(0)
  })

  it('createOrder POSTs and announces accountant:changed', async () => {
    const fetchMock = mockFetch({ ok: true, id: 5 })
    const heard = vi.fn()
    window.addEventListener('accountant:changed', heard)
    try {
      await createOrder({ type: 'sale', category: 'trading', item: 'Laranite', quantity: 200, price_per_unit: 3200, start_at: '2026-06-01T00:00:00Z' })
      expect(heard).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('/api/accountant/orders', expect.objectContaining({ method: 'POST' }))
    } finally {
      window.removeEventListener('accountant:changed', heard)
    }
  })

  it('recordFulfillment POSTs to /orders/:id/fulfillments', async () => {
    const fetchMock = mockFetch({ ok: true })
    await recordFulfillment(7, { quantity: 50, occurred_at: '2026-06-10T00:00:00Z' })
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/orders/7/fulfillments', expect.objectContaining({ method: 'POST' }))
  })

  it('terminateWorkorder POSTs to /workorders/:id/terminate', async () => {
    const fetchMock = mockFetch({ ok: true })
    await terminateWorkorder(3, { note: 'buyer vanished', terminated_by: 'counterparty' })
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/workorders/3/terminate', expect.objectContaining({ method: 'POST' }))
  })

  it('forgiveLoan POSTs to /loans/:id/forgive', async () => {
    const fetchMock = mockFetch({ ok: true, settled: false, outstanding: 20000 })
    await forgiveLoan(7, { amount: 10000 })
    expect(fetchMock).toHaveBeenCalledWith('/api/accountant/loans/7/forgive', expect.objectContaining({ method: 'POST' }))
  })

  it('a late event-triggered refetch for a superseded path cannot overwrite newer data', async () => {
    // Race: mutation fires accountant:changed → refetch for query A starts →
    // user switches filters → query B resolves → A resolves LATE. A's stale
    // payload must be discarded, not painted over B.
    let releaseStale
    const stale = new Promise((resolve) => { releaseStale = resolve })
    let saleCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const s = String(url)
      if (s.includes('type=sale')) {
        saleCalls += 1
        // Mount fetch resolves immediately; the event refetch hangs until
        // released AFTER the filter switch.
        const stalePayload = saleCalls > 1
        if (stalePayload) await stale
        return { ok: true, status: 200, json: async () => ({ total: stalePayload ? 99 : 1 }) }
      }
      return { ok: true, status: 200, json: async () => ({ total: 2 }) }
    })

    const { result, rerender } = renderHook(({ qs }) => useOrders(qs), { initialProps: { qs: 'type=sale' } })
    await waitFor(() => expect(result.current.data?.total).toBe(1))

    window.dispatchEvent(new Event('accountant:changed')) // orphan for type=sale starts
    await waitFor(() => expect(saleCalls).toBe(2))
    rerender({ qs: 'type=purchase' })                      // user switches filters
    await waitFor(() => expect(result.current.data?.total).toBe(2))

    releaseStale()                                         // stale response lands late
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.data.total).toBe(2)              // never 99
  })
})

describe('api() 401 session-expiry handling', () => {
  // jsdom's real window.location throws on href assignment; swap in a plain
  // object we can read back, and restore it (defineProperty isn't a vi mock,
  // so restoreAllMocks won't undo it).
  const realLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: '' } })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation })
    Object.defineProperty(document, 'cookie', { configurable: true, writable: true, value: '' })
  })

  function mockCookie(value) {
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => value })
  }

  it('redirects to /login on 401 when a session cookie is present', async () => {
    mockCookie('better-auth.session_token=abc')
    mockFetch({ error: 'Unauthorized' }, false, 401)
    await expect(addEntry({ amount: 1 })).rejects.toThrow('Unauthorized')
    expect(window.location.href).toBe('/login')
  })

  it('does not redirect on 401 without a session cookie (public visitor)', async () => {
    mockCookie('')
    mockFetch({ error: 'Unauthorized' }, false, 401)
    await expect(addEntry({ amount: 1 })).rejects.toThrow('Unauthorized')
    expect(window.location.href).toBe('')
  })
})
