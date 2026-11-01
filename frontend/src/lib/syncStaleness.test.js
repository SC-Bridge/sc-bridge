import { describe, it, expect } from 'vitest'
import { STALE_AFTER_DAYS, syncAgeDays, isSyncStale, describeSyncAge } from './syncStaleness'

// 2026-11-02 00:00 UTC — "now" for every test so the maths is fixed.
const NOW = Date.UTC(2026, 10, 2)
const DAY = 24 * 60 * 60 * 1000

describe('syncAgeDays', () => {
  it('returns null when there has never been a sync', () => {
    expect(syncAgeDays(null, NOW)).toBeNull()
    expect(syncAgeDays(undefined, NOW)).toBeNull()
    expect(syncAgeDays('', NOW)).toBeNull()
  })

  it('reads SQLite datetime strings as UTC, not local time', () => {
    // user_rsi_profiles.synced_at is datetime('now') — no T, no Z.
    expect(syncAgeDays('2026-05-15 11:40:02', NOW)).toBe(170)
  })

  it('accepts ISO strings with an explicit zone', () => {
    expect(syncAgeDays('2026-10-30T21:33:02Z', NOW)).toBe(2)
  })

  it('floors to whole days', () => {
    expect(syncAgeDays(new Date(NOW - 1.9 * DAY).toISOString(), NOW)).toBe(1)
  })

  it('returns null for garbage', () => {
    expect(syncAgeDays('not a date', NOW)).toBeNull()
  })
})

describe('isSyncStale', () => {
  it('is never stale when there is no sync to be stale about', () => {
    expect(isSyncStale(null, NOW)).toBe(false)
  })

  it('is fresh one day under the threshold', () => {
    const fresh = new Date(NOW - (STALE_AFTER_DAYS - 1) * DAY).toISOString()
    expect(isSyncStale(fresh, NOW)).toBe(false)
  })

  it('is stale at exactly the threshold', () => {
    const onEdge = new Date(NOW - STALE_AFTER_DAYS * DAY).toISOString()
    expect(isSyncStale(onEdge, NOW)).toBe(true)
  })

  it('flags a hangar frozen since May', () => {
    expect(isSyncStale('2026-05-15 11:40:02', NOW)).toBe(true)
  })

  it('honours a custom threshold', () => {
    const twoDays = new Date(NOW - 2 * DAY).toISOString()
    expect(isSyncStale(twoDays, NOW, 1)).toBe(true)
    expect(isSyncStale(twoDays, NOW, 3)).toBe(false)
  })
})

describe('describeSyncAge', () => {
  it('speaks in days, weeks, then months', () => {
    expect(describeSyncAge(0)).toBe('today')
    expect(describeSyncAge(1)).toBe('yesterday')
    expect(describeSyncAge(5)).toBe('5 days ago')
    expect(describeSyncAge(13)).toBe('13 days ago')
    expect(describeSyncAge(14)).toBe('2 weeks ago')
    expect(describeSyncAge(45)).toBe('6 weeks ago')
    expect(describeSyncAge(60)).toBe('2 months ago')
    expect(describeSyncAge(170)).toBe('5 months ago')
  })

  it('has nothing to say about a missing age', () => {
    expect(describeSyncAge(null)).toBe('')
  })
})
