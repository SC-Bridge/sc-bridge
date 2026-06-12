import { useEffect, useId } from 'react'
import { reportWindowFromParams } from '../Reports/reportWindow'

// ---------------------------------------------------------------------------
// Interval options — mirrors backend INTERVALS plus Auto (no param).
// ---------------------------------------------------------------------------

const INTERVALS = ['auto', 'hourly', 'daily', 'weekly', 'monthly']

const INTERVAL_LABELS = {
  auto: 'Auto',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

// Owner decision 2026-06-13: the maximum selectable interval is one step finer
// than the selected period — an interval as large as the period yields a
// one-bucket series. The window span must be STRICTLY greater than these
// thresholds (PeriodSelector's half-open bounds make "Today" exactly 24 h, so
// strictly-greater caps it at hourly). Auto is always available; this is a UI
// cap only — the backend legitimately accepts any interval.
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const MIN_SPAN_MS = {
  hourly: 0,
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
}

function isAllowed(interval, spanMs) {
  if (interval === 'auto') return true
  return spanMs > MIN_SPAN_MS[interval]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Same contract as PeriodSelector: params (URLSearchParams) in; construct new
// URLSearchParams, mutate, call onChange(next).
// Auto (default) = DELETE the interval param (backend default applies).
// Others = SET interval=<value>.
export default function IntervalSelector({ params, onChange }) {
  const groupId = useId()
  const current = params.get('interval') ?? 'auto'
  // Span derives from the SAME window the report pages fetch with.
  const { from, to } = reportWindowFromParams(params)
  const spanMs = new Date(to) - new Date(from)

  // If a period change shrinks the window below the selected interval's
  // threshold, reset to Auto — never leave a disallowed value in the URL/fetch.
  useEffect(() => {
    if (!isAllowed(current, spanMs)) {
      const next = new URLSearchParams(params)
      next.delete('interval')
      onChange(next)
    }
  }, [current, spanMs, params, onChange])

  function select(value) {
    const next = new URLSearchParams(params)
    if (value === 'auto') {
      next.delete('interval')
    } else {
      next.set('interval', value)
    }
    onChange(next)
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {INTERVALS.map((iv) => {
        const allowed = isAllowed(iv, spanMs)
        return (
          <label
            key={iv}
            title={allowed ? undefined : 'Period too short for this interval'}
            className={`flex items-center gap-1 text-sm px-2 py-0.5 ${
              allowed ? 'text-gray-300 cursor-pointer' : 'text-gray-600 cursor-not-allowed'
            }`}
          >
            <input
              type="radio"
              name={groupId}
              checked={current === iv}
              disabled={!allowed}
              onChange={() => select(iv)}
            />
            {INTERVAL_LABELS[iv]}
          </label>
        )
      })}
    </div>
  )
}
