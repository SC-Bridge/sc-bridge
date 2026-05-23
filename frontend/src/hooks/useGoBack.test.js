import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Controlled router mocks — capture navigate() calls and drive location.key.
const mockNavigate = vi.fn()
let mockKey = 'default'
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ key: mockKey }),
}))

import { useGoBack } from './useGoBack'

describe('useGoBack', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('goes back in history when there is in-app history (key !== default)', () => {
    mockKey = 'a1b2c3'
    const { result } = renderHook(() => useGoBack('/missions?view=factions'))
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('uses the fallback when landed directly (key === default)', () => {
    mockKey = 'default'
    const { result } = renderHook(() => useGoBack('/missions?view=factions'))
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith('/missions?view=factions')
  })

  it('uses the fallback when there is no key', () => {
    mockKey = undefined
    const { result } = renderHook(() => useGoBack('/crafting'))
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith('/crafting')
  })
})
