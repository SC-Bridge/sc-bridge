import { useState } from 'react'

// ---------------------------------------------------------------------------
// Date boundary helpers — all boundaries in local time, emitted as UTC ISO.
// ---------------------------------------------------------------------------

function startOfDay(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d) {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function startOfMonday(d) {
  // Returns the Monday of the week containing d (local calendar week).
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay() // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day // distance back to Monday
  r.setDate(r.getDate() + diff)
  return r
}

function startOfMonth(d) {
  const r = new Date(d)
  r.setDate(1)
  r.setHours(0, 0, 0, 0)
  return r
}

// Derive an HTML date-input value (YYYY-MM-DD local) from an ISO string.
function isoToDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const PRESETS = ['all-time', 'today', 'this-week', 'this-month', 'custom']

const PRESET_LABELS = {
  'all-time': 'All time',
  'today': 'Today',
  'this-week': 'This week',
  'this-month': 'This month',
  'custom': 'Custom',
}

function computePreset(preset) {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    case 'this-week':
      return { from: startOfMonday(now).toISOString(), to: endOfDay(now).toISOString() }
    case 'this-month':
      return { from: startOfMonth(now).toISOString(), to: endOfDay(now).toISOString() }
    default:
      return null
  }
}

// Determine which preset to show as initially active from current URL params.
function deriveInitialPreset(params) {
  const from = params.get('from')
  const to = params.get('to')
  if (!from && !to) return 'all-time'
  return 'custom'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// FilterPanel contract: params (URLSearchParams) in; construct new URLSearchParams,
// mutate, call onChange(next).
export default function PeriodSelector({ params, onChange }) {
  const [selected, setSelected] = useState(() => deriveInitialPreset(params))

  function selectPreset(preset) {
    setSelected(preset)
    const next = new URLSearchParams(params)

    if (preset === 'all-time') {
      next.delete('from')
      next.delete('to')
      onChange(next)
      return
    }

    if (preset === 'custom') {
      // Show the inputs without touching params immediately — user will type dates.
      return
    }

    const range = computePreset(preset)
    next.set('from', range.from)
    next.set('to', range.to)
    onChange(next)
  }

  function handleCustomDate(key, dateValue) {
    // dateValue is YYYY-MM-DD from the <input type="date">
    if (!dateValue) return
    // Parse parts and construct locally to avoid UTC-midnight off-by-one in
    // UTC-negative timezones (new Date('YYYY-MM-DD') parses as UTC midnight,
    // then setHours applies local time — one day early west of Greenwich).
    const [y, m, d] = dateValue.split('-').map(Number)
    const next = new URLSearchParams(params)
    if (key === 'from') {
      const date = new Date(y, m - 1, d)
      date.setHours(0, 0, 0, 0)
      next.set('from', date.toISOString())
    } else {
      const date = new Date(y, m - 1, d)
      date.setHours(23, 59, 59, 999)
      next.set('to', date.toISOString())
    }
    onChange(next)
  }

  const showCustomInputs = selected === 'custom'

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {PRESETS.map((preset) => {
          const active = selected === preset
          return (
            <button
              key={preset}
              onClick={() => selectPreset(preset)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                active
                  ? 'border-sc-accent bg-sc-accent/10 text-sc-accent'
                  : 'border-sc-border text-gray-400 hover:border-sc-accent/40'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          )
        })}
      </div>

      {showCustomInputs && (
        <div className="flex gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            From
            <input
              type="date"
              defaultValue={isoToDateInput(params.get('from'))}
              onChange={(e) => handleCustomDate('from', e.target.value)}
              className="bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            To
            <input
              type="date"
              defaultValue={isoToDateInput(params.get('to'))}
              onChange={(e) => handleCustomDate('to', e.target.value)}
              className="bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
      )}
    </div>
  )
}
