import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAnalysis } from './useAPI'

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
