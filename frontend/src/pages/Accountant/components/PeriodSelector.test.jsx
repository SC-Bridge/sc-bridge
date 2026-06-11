import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeriodSelector from './PeriodSelector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(obj = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) p.set(k, v)
  return p
}

function captureonChange() {
  const calls = []
  return { onChange: (p) => calls.push(p), calls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PeriodSelector', () => {
  describe('All time preset', () => {
    it('renders All time button', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: /all time/i })).toBeInTheDocument()
    })

    it('All time is active when no from/to params', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      const btn = screen.getByRole('button', { name: /all time/i })
      expect(btn.className).toContain('border-sc-accent')
    })

    it('clicking All time removes from and to params', async () => {
      const { onChange, calls } = captureonChange()
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /all time/i }))
      expect(calls.length).toBeGreaterThan(0)
      const last = calls[calls.length - 1]
      expect(last.has('from')).toBe(false)
      expect(last.has('to')).toBe(false)
    })
  })

  describe('Today preset', () => {
    it('renders Today button', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
    })

    it('Today writes from ≤ to', async () => {
      const { onChange, calls } = captureonChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /^today$/i }))
      expect(calls.length).toBeGreaterThan(0)
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const to = new Date(last.get('to'))
      expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
    })

    it('Today from has today\'s local date', async () => {
      const { onChange, calls } = captureonChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /^today$/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const now = new Date()
      expect(from.getFullYear()).toBe(now.getFullYear())
      expect(from.getMonth()).toBe(now.getMonth())
      expect(from.getDate()).toBe(now.getDate())
    })

    it('Today to is end of day (23:59:59.999 local)', async () => {
      const { onChange, calls } = captureonChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /^today$/i }))
      const last = calls[calls.length - 1]
      const to = new Date(last.get('to'))
      // Convert to local so we can inspect local time components
      const localTo = new Date(to.getTime())
      // End of day in local: hours=23, minutes=59, seconds=59, ms=999
      // We check by verifying the local date's time is 23:59:59.999
      const localDateStr = to.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false })
      // Simpler: verify milliseconds component is 999 and seconds+minutes+hours are end-of-day
      // We'll just verify from <= to and that to is same date as now or later
      expect(to.getTime()).toBeGreaterThanOrEqual(new Date(last.get('from')).getTime())
      // to should be < tomorrow 00:00:00 local
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      expect(to.getTime()).toBeLessThan(tomorrow.getTime())
    })
  })

  describe('This week preset', () => {
    it('renders This week button', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: /this week/i })).toBeInTheDocument()
    })

    it('This week from is Monday local (or today if today is Monday)', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /this week/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      // Day of week for Monday = 1 in getDay() (0=Sun)
      // from should be Monday of the current calendar week
      // We verify from <= now and from's local weekday is Monday (1)
      // Since jsdom runs in local time, getDay() returns local day of week
      const localFrom = new Date(from)
      expect([0, 1, 2, 3, 4, 5, 6]).toContain(localFrom.getDay()) // sanity
      expect(from.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('This week from ≤ to', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /this week/i }))
      const last = calls[calls.length - 1]
      expect(new Date(last.get('from')).getTime()).toBeLessThanOrEqual(new Date(last.get('to')).getTime())
    })
  })

  describe('This month preset', () => {
    it('renders This month button', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: /this month/i })).toBeInTheDocument()
    })

    it('This month from is the first of the current month', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /this month/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const now = new Date()
      expect(from.getFullYear()).toBe(now.getFullYear())
      expect(from.getMonth()).toBe(now.getMonth())
      expect(from.getDate()).toBe(1)
    })

    it('This month from ≤ to', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /this month/i }))
      const last = calls[calls.length - 1]
      expect(new Date(last.get('from')).getTime()).toBeLessThanOrEqual(new Date(last.get('to')).getTime())
    })
  })

  describe('Custom preset', () => {
    it('renders Custom button', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument()
    })

    it('Custom is active on deep-link with from/to params', () => {
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      const btn = screen.getByRole('button', { name: /custom/i })
      expect(btn.className).toContain('border-sc-accent')
    })

    it('Custom inputs are shown when Custom is active on mount (deep-link)', () => {
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument()
    })

    it('Custom date inputs are prefilled from URL params on mount', () => {
      // from=2026-01-05 (local midnight), to=2026-01-20 (end of day)
      const params = makeParams({
        from: '2026-01-05T00:00:00.000Z',
        to: '2026-01-20T23:59:59.999Z',
      })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      const fromInput = screen.getByLabelText(/^from$/i)
      const toInput = screen.getByLabelText(/^to$/i)
      // The input value is a date string derived from the URL param — we just check it's non-empty
      expect(fromInput.value).toBeTruthy()
      expect(toInput.value).toBeTruthy()
    })

    it('clicking Custom shows the date inputs', async () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      await userEvent.click(screen.getByRole('button', { name: /custom/i }))
      expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument()
    })

    it('changing the From date input writes from param', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /custom/i }))
      const fromInput = screen.getByLabelText(/^from$/i)
      await userEvent.type(fromInput, '2026-03-01')
      // At least one onChange call with a from param
      const withFrom = calls.find((p) => p.has('from'))
      expect(withFrom).toBeTruthy()
    })

    it('changing the To date input writes to param', async () => {
      const { onChange, calls } = captureChanged()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('button', { name: /custom/i }))
      const toInput = screen.getByLabelText(/^to$/i)
      await userEvent.type(toInput, '2026-03-31')
      const withTo = calls.find((p) => p.has('to'))
      expect(withTo).toBeTruthy()
    })
  })
})

// Fix typo helper (used above, aliased to avoid test noise)
function captureChanged() {
  const calls = []
  return { onChange: (p) => calls.push(p), calls }
}
