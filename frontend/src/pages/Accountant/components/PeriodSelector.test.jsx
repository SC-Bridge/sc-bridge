import { describe, it, expect } from 'vitest'
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

function captureOnChange() {
  const calls = []
  return { onChange: (p) => calls.push(p), calls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PeriodSelector', () => {
  describe('All time preset', () => {
    it('renders All time radio', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /all time/i })).toBeInTheDocument()
    })

    it('All time is checked when no from/to params', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /all time/i })).toBeChecked()
    })

    it('clicking All time removes from and to params', async () => {
      const { onChange, calls } = captureOnChange()
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /all time/i }))
      expect(calls.length).toBeGreaterThan(0)
      const last = calls[calls.length - 1]
      expect(last.has('from')).toBe(false)
      expect(last.has('to')).toBe(false)
    })
  })

  describe('Today preset', () => {
    it('renders Today radio', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /^today$/i })).toBeInTheDocument()
    })

    it('Today writes from ≤ to', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /^today$/i }))
      expect(calls.length).toBeGreaterThan(0)
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const to = new Date(last.get('to'))
      expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
    })

    it('Today from has today\'s local date', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /^today$/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const now = new Date()
      expect(from.getFullYear()).toBe(now.getFullYear())
      expect(from.getMonth()).toBe(now.getMonth())
      expect(from.getDate()).toBe(now.getDate())
    })

    it('Today to is the start of the NEXT local day (half-open, aligned with reports)', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /^today$/i }))
      const last = calls[calls.length - 1]
      const to = new Date(last.get('to'))
      expect(to.getHours()).toBe(0)
      expect(to.getMinutes()).toBe(0)
      expect(to.getSeconds()).toBe(0)
      expect(to.getMilliseconds()).toBe(0)
      const tomorrow = new Date()
      tomorrow.setHours(0, 0, 0, 0)
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(to.getTime()).toBe(tomorrow.getTime())
    })
  })

  describe('This week preset', () => {
    it('renders This week radio', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /this week/i })).toBeInTheDocument()
    })

    it('This week from is Monday local (or today if today is Monday)', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /this week/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      expect(from.getDay()).toBe(1)
      expect(from.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('This week from ≤ to', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /this week/i }))
      const last = calls[calls.length - 1]
      expect(new Date(last.get('from')).getTime()).toBeLessThanOrEqual(new Date(last.get('to')).getTime())
    })
  })

  describe('This month preset', () => {
    it('renders This month radio', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /this month/i })).toBeInTheDocument()
    })

    it('This month from is the first of the current month', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /this month/i }))
      const last = calls[calls.length - 1]
      const from = new Date(last.get('from'))
      const now = new Date()
      expect(from.getFullYear()).toBe(now.getFullYear())
      expect(from.getMonth()).toBe(now.getMonth())
      expect(from.getDate()).toBe(1)
    })

    it('This month from ≤ to', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /this month/i }))
      const last = calls[calls.length - 1]
      expect(new Date(last.get('from')).getTime()).toBeLessThanOrEqual(new Date(last.get('to')).getTime())
    })
  })

  describe('Custom preset', () => {
    it('renders Custom radio', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /custom/i })).toBeInTheDocument()
    })

    it('all preset radios share the same name group (single-select)', () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      const radios = screen.getAllByRole('radio')
      const names = radios.map((r) => r.name)
      expect(new Set(names).size).toBe(1)
      expect(radios).toHaveLength(5)
    })

    it('Custom is checked on deep-link with from/to params', () => {
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /custom/i })).toBeChecked()
    })

    it('Custom inputs are shown when Custom is active on mount (deep-link)', () => {
      const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument()
    })

    it('Custom date inputs are prefilled from URL params on mount (To shows last INCLUDED day)', () => {
      // from=2026-01-05 (local midnight), to = exclusive next-midnight bound
      const fromIso = '2026-01-05T00:00:00.000Z'
      const toIso = '2026-01-21T00:00:00.000Z' // half-open: last included day is Jan 20 (local)
      const params = makeParams({ from: fromIso, to: toIso })
      render(<PeriodSelector params={params} onChange={() => {}} />)
      const fromInput = screen.getByLabelText(/^from$/i)
      const toInput = screen.getByLabelText(/^to$/i)
      // Derive the expected input values using the same local-date logic as the component.
      function isoToDateInput(iso) {
        const d = new Date(iso)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      expect(fromInput.value).toBe(isoToDateInput(fromIso))
      // To input shows the bound minus 1 ms — the last day the window includes.
      expect(toInput.value).toBe(isoToDateInput(new Date(new Date(toIso).getTime() - 1)))
    })

    it('clicking Custom shows the date inputs', async () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      await userEvent.click(screen.getByRole('radio', { name: /custom/i }))
      expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument()
    })

    it('custom From date round-trip preserves local calendar day and sets local 00:00:00.000', async () => {
      // This test pins that handleCustomDate('from', '2026-07-15') emits a `from`
      // param whose local date components equal 2026-07-15 and whose local time is
      // 00:00:00.000. It would fail against `new Date('2026-07-15')` in any UTC-negative
      // timezone (the UTC-midnight parse shifts one day back when setHours applies locally).
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /custom/i }))
      const fromInput = screen.getByLabelText(/^from$/i)
      await userEvent.type(fromInput, '2026-07-15')
      const withFrom = calls.find((p) => p.has('from'))
      expect(withFrom).toBeTruthy()
      const emitted = new Date(withFrom.get('from'))
      expect(emitted.getFullYear()).toBe(2026)
      expect(emitted.getMonth()).toBe(6) // July = index 6
      expect(emitted.getDate()).toBe(15)
      expect(emitted.getHours()).toBe(0)
      expect(emitted.getMinutes()).toBe(0)
      expect(emitted.getSeconds()).toBe(0)
      expect(emitted.getMilliseconds()).toBe(0)
    })

    it('custom To date emits the NEXT local midnight (half-open — picked day fully included)', async () => {
      const { onChange, calls } = captureOnChange()
      render(<PeriodSelector params={makeParams()} onChange={onChange} />)
      await userEvent.click(screen.getByRole('radio', { name: /custom/i }))
      const toInput = screen.getByLabelText(/^to$/i)
      await userEvent.type(toInput, '2026-07-15')
      const withTo = calls.find((p) => p.has('to'))
      expect(withTo).toBeTruthy()
      const emitted = new Date(withTo.get('to'))
      expect(emitted.getFullYear()).toBe(2026)
      expect(emitted.getMonth()).toBe(6) // July = index 6
      expect(emitted.getDate()).toBe(16) // exclusive bound: midnight after the picked day
      expect(emitted.getHours()).toBe(0)
      expect(emitted.getMinutes()).toBe(0)
      expect(emitted.getSeconds()).toBe(0)
      expect(emitted.getMilliseconds()).toBe(0)
    })
  })

  describe('resync on external param change (browser back/forward)', () => {
    it('reverts to All time when the window is cleared externally', () => {
      const withRange = makeParams({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-08T00:00:00.000Z' })
      const { rerender } = render(<PeriodSelector params={withRange} onChange={() => {}} />)
      // A deep-linked window reads as Custom on mount.
      expect(screen.getByRole('radio', { name: /custom/i })).toBeChecked()
      // Back clears from/to: the radio must follow the URL, not stay on Custom.
      rerender(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /all time/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /custom/i })).not.toBeChecked()
    })

    it('reflects an externally-applied window as Custom when previously All time', () => {
      const { rerender } = render(<PeriodSelector params={makeParams()} onChange={() => {}} />)
      expect(screen.getByRole('radio', { name: /all time/i })).toBeChecked()
      rerender(
        <PeriodSelector
          params={makeParams({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-08T00:00:00.000Z' })}
          onChange={() => {}}
        />,
      )
      expect(screen.getByRole('radio', { name: /custom/i })).toBeChecked()
    })
  })

  describe('to-only (as-of) mode', () => {
    it('hides the From input and labels the bound "As of"', async () => {
      render(<PeriodSelector params={makeParams()} onChange={() => {}} toOnly />)
      await userEvent.click(screen.getByRole('radio', { name: /custom/i }))
      expect(screen.queryByLabelText(/^from$/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/as of/i)).toBeInTheDocument()
    })
  })
})
