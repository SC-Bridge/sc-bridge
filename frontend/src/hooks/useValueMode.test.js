import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useValueMode, { setValueMode, __resetValueMode } from './useValueMode'

beforeEach(() => {
  localStorage.clear()
  __resetValueMode()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useValueMode', () => {
  it('defaults to pledge', () => {
    const { result } = renderHook(() => useValueMode())
    expect(result.current.valueMode).toBe('pledge')
    expect(result.current.isMelt).toBe(false)
  })

  it('toggles between pledge and melt', () => {
    const { result } = renderHook(() => useValueMode())
    act(() => result.current.toggleValueMode())
    expect(result.current.valueMode).toBe('melt')
    expect(result.current.isMelt).toBe(true)
    act(() => result.current.toggleValueMode())
    expect(result.current.valueMode).toBe('pledge')
  })

  it('shares state across separate hook consumers', () => {
    // The point of the module-level store: the dashboard and the fleet page
    // must never disagree about which number they are showing.
    const a = renderHook(() => useValueMode())
    const b = renderHook(() => useValueMode())
    act(() => a.result.current.setValueMode('melt'))
    expect(b.result.current.valueMode).toBe('melt')
  })

  it('persists the choice to localStorage', () => {
    const { result } = renderHook(() => useValueMode())
    act(() => result.current.setValueMode('melt'))
    expect(localStorage.getItem('sc-bridge-value-mode')).toBe('melt')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem('sc-bridge-value-mode', 'bananas')
    __resetValueMode()
    const { result } = renderHook(() => useValueMode())
    expect(result.current.valueMode).toBe('pledge')
  })

  it('ignores an unknown mode passed to the setter', () => {
    const { result } = renderHook(() => useValueMode())
    act(() => setValueMode('nonsense'))
    expect(result.current.valueMode).toBe('pledge')
  })

  it('still works when localStorage throws (private window)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useValueMode())
    act(() => result.current.setValueMode('melt'))
    expect(result.current.valueMode).toBe('melt')
    spy.mockRestore()
  })
})
