import { describe, it, expect } from 'vitest'
import { reportWindowFromParams, DEFAULT_FROM, DEFAULT_TO } from './reportWindow'

describe('reportWindow helpers', () => {
  describe('stability — same values in → same string out', () => {
    it('returns identical strings on two calls with no params', () => {
      const a = reportWindowFromParams(new URLSearchParams())
      const b = reportWindowFromParams(new URLSearchParams())
      expect(a.from).toBe(b.from)
      expect(a.to).toBe(b.to)
      expect(a.qs).toBe(b.qs)
    })

    it('returns identical strings on two calls with the same params', () => {
      const p = new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })
      const a = reportWindowFromParams(p)
      const b = reportWindowFromParams(p)
      expect(a.from).toBe(b.from)
      expect(a.to).toBe(b.to)
      expect(a.qs).toBe(b.qs)
    })

    it('returns identical strings on two calls with interval param', () => {
      const p = new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z', interval: 'daily' })
      const a = reportWindowFromParams(p)
      const b = reportWindowFromParams(p)
      expect(a.qs).toBe(b.qs)
    })
  })

  describe('params override defaults', () => {
    it('uses params.from and params.to when both are present', () => {
      const p = new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })
      const { from, to } = reportWindowFromParams(p)
      expect(from).toBe('2026-01-01T00:00:00.000Z')
      expect(to).toBe('2026-07-01T00:00:00.000Z')
    })

    it('falls back to module-level defaults when no params are present', () => {
      const { from, to } = reportWindowFromParams(new URLSearchParams())
      expect(from).toBe(DEFAULT_FROM)
      expect(to).toBe(DEFAULT_TO)
    })
  })

  describe('interval passthrough', () => {
    it('includes interval in qs when interval param is present', () => {
      const p = new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z', interval: 'daily' })
      const { qs } = reportWindowFromParams(p)
      expect(qs).toContain('interval=daily')
    })

    it('omits interval from qs when interval param is absent', () => {
      const p = new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })
      const { qs } = reportWindowFromParams(p)
      expect(qs).not.toContain('interval')
    })

    it('always omits interval from qs when no params at all', () => {
      const { qs } = reportWindowFromParams(new URLSearchParams())
      expect(qs).not.toContain('interval')
    })
  })

  describe('module-level constants', () => {
    it('DEFAULT_FROM is the epoch start', () => {
      expect(DEFAULT_FROM).toBe('1970-01-01T00:00:00.000Z')
    })

    it('DEFAULT_TO is in the future (now + 1 day)', () => {
      const tomorrow = new Date(Date.now() + 86_400_000)
      // Allow a 5-second window around module load time
      const diff = Math.abs(new Date(DEFAULT_TO).getTime() - tomorrow.getTime())
      expect(diff).toBeLessThan(5_000)
    })
  })
})
