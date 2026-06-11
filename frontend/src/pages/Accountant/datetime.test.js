import { describe, it, expect } from 'vitest'
import { localDatetimeNow } from './datetime'

describe('localDatetimeNow', () => {
  it('returns a YYYY-MM-DDTHH:MM shaped string', () => {
    const result = localDatetimeNow()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('parses back to approximately the current time (within 1 minute)', () => {
    // Build expected local datetime string from Date.now() using the same technique
    // as the implementation, then compare as strings (truncated to minute).
    const ref = new Date()
    ref.setMinutes(ref.getMinutes() - ref.getTimezoneOffset())
    const expected = ref.toISOString().slice(0, 16)
    const result = localDatetimeNow()
    // Allow for the possibility the minute ticks over between the two calls
    expect(result === expected || result <= expected).toBe(true)
    // Result must not be more than 1 minute behind expected
    expect(new Date(result).getTime()).toBeGreaterThanOrEqual(new Date(expected).getTime() - 60_000)
  })
})
