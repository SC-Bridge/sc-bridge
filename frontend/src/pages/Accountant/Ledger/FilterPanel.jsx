import { LEDGER_CATEGORIES, CATEGORY_LABELS, SOURCE_LABELS } from '../constants'

// Visible sources toggle set; accrual_tick is OFF by default (locked UX decision).
export const DEFAULT_SOURCES = ['parsed', 'manual', 'adjustment', 'loan_principal', 'loan_fee', 'loan_repayment']

export default function FilterPanel({ params, onChange }) {
  const activeCategories = params.getAll('category')
  const activeSources = params.getAll('source').length ? params.getAll('source') : DEFAULT_SOURCES

  function toggle(key, value, active) {
    const next = new URLSearchParams(params)
    const current = key === 'source' ? activeSources : next.getAll(key)
    next.delete(key)
    const updated = active ? current.filter((v) => v !== value) : [...current, value]
    for (const v of updated) next.append(key, v)
    onChange(next)
  }

  function setText(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    onChange(next)
  }

  return (
    <aside className="w-56 shrink-0 space-y-4" data-testid="ledger-filters">
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
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => setText('q', e.target.value)}
          placeholder="Description, location…"
          className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
        />
      </div>
    </aside>
  )
}
