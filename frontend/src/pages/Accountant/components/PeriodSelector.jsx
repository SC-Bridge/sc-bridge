import { useEffect, useState, useId } from 'react'

// ---------------------------------------------------------------------------
// Date boundary helpers — all boundaries in local time, emitted as UTC ISO.
// ---------------------------------------------------------------------------

function startOfDay(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

// Half-open upper bound: local midnight of the NEXT day. Pairs with the
// backend's `occurred_at < to` (aligned with M3 report windows).
function startOfNextDay(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() + 1)
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

// The stored 'to' is an EXCLUSIVE next-midnight bound — the date input must
// show the last included day, not the boundary day.
function isoToDateInputExclusive(iso) {
  if (!iso) return ''
  return isoToDateInput(new Date(new Date(iso).getTime() - 1))
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
      return { from: startOfDay(now).toISOString(), to: startOfNextDay(now).toISOString() }
    case 'this-week':
      return { from: startOfMonday(now).toISOString(), to: startOfNextDay(now).toISOString() }
    case 'this-month':
      return { from: startOfMonth(now).toISOString(), to: startOfNextDay(now).toISOString() }
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
// toOnly renders the selector in "as of" mode (Balance Sheet): only the upper
// bound is meaningful, so the custom From input is hidden and To is relabelled.
export default function PeriodSelector({ params, onChange, toOnly = false }) {
  const groupId = useId()
  const [selected, setSelected] = useState(() => deriveInitialPreset(params))

  // Resync the active preset when the URL window changes from outside this
  // component (browser back/forward, deep link). Without this the radio keeps
  // showing the old preset while the data has already reverted.
  //   - No from/to → all-time, whatever was selected before.
  //   - A window present while we were on all-time means the change came from
  //     outside; reflect it as Custom (a bare window is indistinguishable from a
  //     preset, so deep-linked windows always read as Custom — matching mount).
  //   - Otherwise keep the active preset: today/this-week/this-month/custom all
  //     emit a window, so our own preset clicks must not be clobbered.
  useEffect(() => {
    const hasRange = params.get('from') || params.get('to')
    setSelected((prev) => {
      if (!hasRange) return 'all-time'
      return prev === 'all-time' ? 'custom' : prev
    })
  }, [params])

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
    const date = new Date(y, m - 1, d)
    const next = new URLSearchParams(params)
    if (key === 'from') {
      // new Date(y, m-1, d) already yields local midnight — no setHours needed
      next.set('from', date.toISOString())
    } else {
      // Selected day stays fully included: half-open bound = next local midnight
      next.set('to', startOfNextDay(date).toISOString())
    }
    onChange(next)
  }

  const showCustomInputs = selected === 'custom'

  return (
    <div className="space-y-2">
      <div>
        {PRESETS.map((preset) => (
          <label key={preset} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
            <input
              type="radio"
              name={groupId}
              checked={selected === preset}
              onChange={() => selectPreset(preset)}
            />
            {PRESET_LABELS[preset]}
          </label>
        ))}
      </div>

      {showCustomInputs && (
        <div className="flex gap-3 items-end">
          {!toOnly && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              From
              <input
                type="date"
                defaultValue={isoToDateInput(params.get('from'))}
                onChange={(e) => handleCustomDate('from', e.target.value)}
                className="bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm text-white"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {toOnly ? 'As of' : 'To'}
            <input
              type="date"
              defaultValue={isoToDateInputExclusive(params.get('to'))}
              onChange={(e) => handleCustomDate('to', e.target.value)}
              className="bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
      )}
    </div>
  )
}
