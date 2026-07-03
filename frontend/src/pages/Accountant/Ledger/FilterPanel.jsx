import { useEffect, useState } from 'react'
import { LEDGER_CATEGORIES, CATEGORY_LABELS, SOURCE_LABELS } from '../constants'
import PeriodSelector from '../components/PeriodSelector'

// Visible sources toggle set; accrual_tick is OFF by default (locked UX decision).
// M5: order/workorder sources (incl. reserve/release) are ON by default — design §5
// wants locked funds visible; the source checkboxes are the "Order reserves" toggle.
export const DEFAULT_SOURCES = [
  'parsed', 'manual', 'adjustment',
  'loan_principal', 'loan_fee', 'loan_repayment', 'loan_forgiveness',
  'po_reserve', 'po_reserve_release', 'order_fulfillment',
  'contract_fine', 'wo_settlement', 'workorder_summary',
]

export default function FilterPanel({ params, onChange }) {
  const activeCategories = params.getAll('category')
  const activeSources = params.getAll('source').length ? params.getAll('source') : DEFAULT_SOURCES

  // Local search state so typing is instant; the debounced effect below pushes
  // the settled value to the URL once, not one API refetch per keystroke.
  const [search, setSearch] = useState(params.get('q') ?? '')

  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search === current) return undefined
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (search) next.set('q', search)
      else next.delete('q')
      onChange(next)
    }, 300)
    return () => clearTimeout(t)
  }, [search, params, onChange])

  function toggle(key, value, active) {
    const next = new URLSearchParams(params)
    const current = key === 'source' ? activeSources : next.getAll(key)
    next.delete(key)
    const updated = active ? current.filter((v) => v !== value) : [...current, value]
    for (const v of updated) next.append(key, v)
    onChange(next)
  }

  return (
    <aside className="w-56 shrink-0 space-y-4" data-testid="ledger-filters">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Period</h3>
        <PeriodSelector params={params} onChange={onChange} />
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Category</h3>
        {LEDGER_CATEGORIES.map((cat) => {
          const active = activeCategories.includes(cat)
          return (
            <label key={cat} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
              <input type="checkbox" checked={active} onChange={() => toggle('category', cat, active)} />
              {CATEGORY_LABELS[cat]}
            </label>
          )
        })}
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Source</h3>
        {Object.entries(SOURCE_LABELS).map(([src, label]) => {
          const active = activeSources.includes(src)
          return (
            <label key={src} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
              <input type="checkbox" checked={active} onChange={() => toggle('source', src, active)} />
              {label}
            </label>
          )
        })}
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Search</h3>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Description, location…"
          className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
        />
      </div>
    </aside>
  )
}
