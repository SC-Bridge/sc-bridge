import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IntervalSelector from './IntervalSelector'

function makeParams(obj = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) p.set(k, v)
  return p
}

function captureOnChange() {
  const calls = []
  return { onChange: (p) => calls.push(p), calls }
}

describe('IntervalSelector', () => {
  it('renders 5 options: Auto, Hourly, Daily, Weekly, Monthly', () => {
    render(<IntervalSelector params={makeParams()} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^auto$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^hourly$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^daily$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^weekly$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^monthly$/i })).toBeInTheDocument()
  })

  it('Auto is checked by default when no interval param is set', () => {
    render(<IntervalSelector params={makeParams()} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^auto$/i })).toBeChecked()
  })

  it('clicking Daily writes interval=daily to params', async () => {
    const { onChange, calls } = captureOnChange()
    render(<IntervalSelector params={makeParams()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /^daily$/i }))
    expect(calls.length).toBeGreaterThan(0)
    const last = calls[calls.length - 1]
    expect(last.get('interval')).toBe('daily')
  })

  it('clicking Auto deletes the interval param', async () => {
    const { onChange, calls } = captureOnChange()
    const params = makeParams({ interval: 'weekly' })
    render(<IntervalSelector params={params} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /^auto$/i }))
    expect(calls.length).toBeGreaterThan(0)
    const last = calls[calls.length - 1]
    expect(last.has('interval')).toBe(false)
  })

  it('deep-link with interval=weekly shows Weekly as active', () => {
    render(<IntervalSelector params={makeParams({ interval: 'weekly' })} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^weekly$/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^auto$/i })).not.toBeChecked()
  })

  it('all radios share the same name group (single-select)', () => {
    render(<IntervalSelector params={makeParams()} onChange={() => {}} />)
    const radios = screen.getAllByRole('radio')
    const names = radios.map((r) => r.name)
    expect(new Set(names).size).toBe(1)
    expect(radios).toHaveLength(5)
  })

  it('clicking Hourly writes interval=hourly', async () => {
    const { onChange, calls } = captureOnChange()
    render(<IntervalSelector params={makeParams()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /^hourly$/i }))
    const last = calls[calls.length - 1]
    expect(last.get('interval')).toBe('hourly')
  })

  it('clicking Monthly writes interval=monthly', async () => {
    const { onChange, calls } = captureOnChange()
    render(<IntervalSelector params={makeParams()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /^monthly$/i }))
    const last = calls[calls.length - 1]
    expect(last.get('interval')).toBe('monthly')
  })

  it('preserves other params when setting interval', async () => {
    const { onChange, calls } = captureOnChange()
    const params = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' })
    render(<IntervalSelector params={params} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /^daily$/i }))
    const last = calls[calls.length - 1]
    expect(last.get('interval')).toBe('daily')
    expect(last.get('from')).toBe('2026-01-01T00:00:00.000Z')
    expect(last.get('to')).toBe('2026-07-01T00:00:00.000Z')
  })
})

// Owner decision 2026-06-13: the maximum selectable interval is one step finer
// than the selected period — an interval as large as the period yields a
// one-bucket series. Rule (strictly greater): hourly always; daily iff
// span > 24 h; weekly iff span > 7 d; monthly iff span > 30 d. Auto untouched.
describe('IntervalSelector — period cap (owner decision 2026-06-13)', () => {
  // PeriodSelector emits half-open bounds (to = next local midnight), so
  // "Today" spans exactly 24 h.
  const TODAY = { from: '2026-06-12T00:00:00.000Z', to: '2026-06-13T00:00:00.000Z' }
  const FIVE_DAYS = { from: '2026-06-08T00:00:00.000Z', to: '2026-06-13T00:00:00.000Z' }
  const THIRTEEN_DAYS = { from: '2026-06-01T00:00:00.000Z', to: '2026-06-14T00:00:00.000Z' }

  it('Today window (24h): hourly enabled; daily, weekly, monthly disabled', () => {
    render(<IntervalSelector params={makeParams(TODAY)} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^auto$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^hourly$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^daily$/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^weekly$/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^monthly$/i })).toBeDisabled()
  })

  it('5-day window: daily enabled; weekly and monthly disabled', () => {
    render(<IntervalSelector params={makeParams(FIVE_DAYS)} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^hourly$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^daily$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^weekly$/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^monthly$/i })).toBeDisabled()
  })

  it('13-day window: weekly enabled; monthly disabled', () => {
    render(<IntervalSelector params={makeParams(THIRTEEN_DAYS)} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /^daily$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^weekly$/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^monthly$/i })).toBeDisabled()
  })

  it('no from/to (all-time default window): all intervals enabled', () => {
    render(<IntervalSelector params={makeParams()} onChange={() => {}} />)
    for (const name of [/^auto$/i, /^hourly$/i, /^daily$/i, /^weekly$/i, /^monthly$/i]) {
      expect(screen.getByRole('radio', { name })).toBeEnabled()
    }
  })

  it('disabled options carry an explanatory title', () => {
    render(<IntervalSelector params={makeParams(TODAY)} onChange={() => {}} />)
    const monthly = screen.getByRole('radio', { name: /^monthly$/i })
    expect(monthly.closest('label')).toHaveAttribute('title', 'Period too short for this interval')
  })

  it('selected interval=monthly + period shrinks to Today: interval param removed, from/to clean', () => {
    const { onChange, calls } = captureOnChange()
    const wide = makeParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-06-13T00:00:00.000Z', interval: 'monthly' })
    const { rerender } = render(<IntervalSelector params={wide} onChange={onChange} />)
    expect(calls).toHaveLength(0) // monthly is legal in the wide window — no reset

    const shrunk = makeParams({ ...TODAY, interval: 'monthly' })
    rerender(<IntervalSelector params={shrunk} onChange={onChange} />)
    expect(calls.length).toBeGreaterThan(0)
    const last = calls[calls.length - 1]
    expect(last.has('interval')).toBe(false)
    expect(last.get('from')).toBe(TODAY.from)
    expect(last.get('to')).toBe(TODAY.to)
  })
})
