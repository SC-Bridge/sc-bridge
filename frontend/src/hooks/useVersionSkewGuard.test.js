import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { decideSkewAction } from './useVersionSkewGuard'

describe('decideSkewAction', () => {
  it('does nothing while the server build is unknown', () => {
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: undefined, reloadedFor: null })).toBe('none')
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: null, reloadedFor: null })).toBe('none')
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 42, reloadedFor: null })).toBe('none')
  })

  it('does nothing when builds match', () => {
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 'abc123', reloadedFor: null })).toBe('none')
  })

  it('ignores non-CI builds on either side', () => {
    expect(decideSkewAction({ clientBuild: 'dev', serverBuild: 'abc123', reloadedFor: null })).toBe('none')
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 'dev', reloadedFor: null })).toBe('none')
    expect(decideSkewAction({ clientBuild: 'dev', serverBuild: 'dev', reloadedFor: null })).toBe('none')
  })

  it('reloads on a fresh mismatch', () => {
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 'def456', reloadedFor: null })).toBe('reload')
  })

  it('falls back to the toast when a reload for this build already happened (loop guard)', () => {
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 'def456', reloadedFor: 'def456' })).toBe('toast')
  })

  it('reloads again when the server moves to a NEWER build than the one already reloaded for', () => {
    expect(decideSkewAction({ clientBuild: 'abc123', serverBuild: 'ghi789', reloadedFor: 'def456' })).toBe('reload')
  })
})

// Hook-level tests. CLIENT_BUILD is derived at module-load time from the
// vite-injected __BUILD_ID__ global, which tests never define ("dev"),
// tripping the dev exemption in decideSkewAction. Stub the global and
// re-import the module fresh so the hook behaves like a real CI build.
let mockPathname = '/dashboard'
let mockStatusData = { build: 'abc123' }
const mockRefetch = vi.fn()

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
}))

vi.mock('./useAPI', () => ({
  useStatus: () => ({ data: mockStatusData, refetch: mockRefetch }),
}))

describe('useVersionSkewGuard', () => {
  let useVersionSkewGuard
  let reloadSpy

  beforeAll(async () => {
    vi.stubGlobal('__BUILD_ID__', 'abc123')
    vi.resetModules()
    ;({ useVersionSkewGuard } = await import('./useVersionSkewGuard'))
  })

  beforeEach(() => {
    sessionStorage.clear()
    mockPathname = '/dashboard'
    mockRefetch.mockClear()
    reloadSpy = vi.fn()
    // jsdom's Location.prototype.reload isn't configurable enough for
    // vi.spyOn — replace the whole location object instead.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true,
    })
  })

  it('auto-reloads on a fresh mismatch, even on the landing render', () => {
    mockStatusData = { build: 'def456' }

    renderHook(() => useVersionSkewGuard())

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('skew-reloaded-for')).toBe('def456')
  })

  it('falls back to the toast once a reload for this server build already happened', () => {
    mockStatusData = { build: 'def456' }
    sessionStorage.setItem('skew-reloaded-for', 'def456')

    const { result } = renderHook(() => useVersionSkewGuard())

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(result.current.stale).toBe(true)
  })

  it('does nothing when the client and server builds match', () => {
    mockStatusData = { build: 'abc123' }

    const { result } = renderHook(() => useVersionSkewGuard())

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(result.current.stale).toBe(false)
  })
})
