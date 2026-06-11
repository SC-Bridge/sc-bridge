import { useId } from 'react'

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
      {INTERVALS.map((iv) => (
        <label key={iv} className="flex items-center gap-1 text-sm text-gray-300 px-2 py-0.5 cursor-pointer">
          <input
            type="radio"
            name={groupId}
            checked={current === iv}
            onChange={() => select(iv)}
          />
          {INTERVAL_LABELS[iv]}
        </label>
      ))}
    </div>
  )
}
