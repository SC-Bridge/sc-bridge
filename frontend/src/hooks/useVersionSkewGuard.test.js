import { describe, it, expect } from 'vitest'
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
