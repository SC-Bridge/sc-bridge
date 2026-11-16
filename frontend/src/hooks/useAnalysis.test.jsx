import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAnalysis, useAPI } from './useAPI'

const mockFetch = () => {
  const fn = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('useAnalysis', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests plain /analysis when no accounts are given', async () => {
    const fetchFn = mockFetch()
    renderHook(() => useAnalysis({ accounts: null }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    expect(fetchFn.mock.calls[0][0]).toBe('/api/analysis')
  })

  it('adds ?accounts= when accounts are given', async () => {
    const fetchFn = mockFetch()
    renderHook(() => useAnalysis({ accounts: '1,3' }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    expect(fetchFn.mock.calls[0][0]).toBe('/api/analysis?accounts=1%2C3')
  })
})

describe('useAPI stale-response guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ignores an older response that resolves after a newer path was requested', async () => {
    const resolvers = {}
    vi.stubGlobal('fetch', vi.fn((url) => new Promise((resolve) => {
      resolvers[url] = (body) => resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })))
    const { result, rerender } = renderHook(({ path }) => useAPI(path), { initialProps: { path: '/analysis' } })
    rerender({ path: '/analysis?accounts=2' })
    await waitFor(() => expect(Object.keys(resolvers)).toHaveLength(2))

    resolvers['/api/analysis?accounts=2']({ scope: 'narrow' })
    await waitFor(() => expect(result.current.data).toEqual({ scope: 'narrow' }))
    resolvers['/api/analysis']({ scope: 'all' })
    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.data).toEqual({ scope: 'narrow' })
    expect(result.current.loading).toBe(false)
  })
})
