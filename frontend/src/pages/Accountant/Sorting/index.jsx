import { useEffect, useState } from 'react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { LEDGER_CATEGORIES, CATEGORY_LABELS, CATEGORY_HOTKEYS, DEFAULT_TAGS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import { useSorting, useBadges, categorizeEntries } from '../hooks'
import TagPicker from './TagPicker'

export default function Sorting() {
  const { data, error, loading, refetch } = useSorting()
  const badges = useBadges()
  const [selected, setSelected] = useState([])
  const [pendingCategory, setPendingCategory] = useState(null) // tagged category awaiting TagPicker
  const [actionError, setActionError] = useState(null)

  async function categorize(category, tag) {
    if (selected.length === 0) return
    setActionError(null)
    try {
      await categorizeEntries(selected, category, tag)
      setSelected([])
      setPendingCategory(null)
      refetch()
    } catch (e) {
      setActionError(e.message)
      setPendingCategory(null)
    }
  }

  function onCategoryClick(category) {
    if (selected.length === 0) return
    if ((DEFAULT_TAGS[category] ?? []).length > 0) setPendingCategory(category)
    else categorize(category, undefined)
  }

  // Keyboard 1-5 (UX doc B.1)
  // No dependency array is intentional: re-binds every render so onKey always
  // closes over the current `selected` and `pendingCategory` state without going stale.
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      const category = CATEGORY_HOTKEYS[e.key]
      if (category) onCategoryClick(category)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="mt-3 text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  const { entries, count } = data
  const overThreshold = badges.data && badges.data.sorting >= badges.data.sortingThreshold

  function toggleRow(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="SORTING LIST" subtitle={`Queue: ${count}`} />

      {overThreshold && (
        <div
          data-testid="threshold-banner"
          role="status"
          className="panel p-3 text-sm border-sc-warn/40 text-sc-warn"
        >
          {badges.data.sorting} unsorted entries — your reminder threshold is {badges.data.sortingThreshold}.
        </div>
      )}

      {actionError && <div role="alert" className="panel p-3 text-sm text-sc-danger">{actionError}</div>}

      {count === 0 ? (
        <div className="panel p-10 text-center text-gray-400">All sorted. New parsed entries land here.</div>
      ) : (
        <div className="flex gap-6">
          <div className="flex-1 space-y-2 min-w-0">
            {entries.map((e) => {
              const active = selected.includes(e.id)
              return (
                <button
                  key={e.id}
                  onClick={() => toggleRow(e.id)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    active ? 'border-sc-accent bg-sc-accent/10' : 'border-sc-border hover:border-sc-accent2/40'
                  }`}
                >
                  <span className="text-white text-sm font-medium">{e.description ?? 'Unknown transaction'}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {new Date(e.occurred_at).toLocaleString()}{e.location ? ` · ${e.location}` : ''} ·{' '}
                    <span className={signClass(e.amount)}>{formatAUEC(e.amount)}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <aside className="w-52 shrink-0 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-500">
              Categorize {selected.length > 0 ? `(${selected.length})` : ''}
            </h3>
            {LEDGER_CATEGORIES.map((c, i) => (
              <button
                key={c}
                onClick={() => onCategoryClick(c)}
                disabled={selected.length === 0}
                className="w-full text-left border border-sc-border rounded px-3 py-2 text-sm text-gray-300 hover:border-sc-accent/60 disabled:opacity-40"
              >
                <span className="text-gray-600 font-mono mr-2">{i + 1}</span>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
            <p className="text-xs text-gray-600 pt-1">Select rows, then click a category or press 1–5.</p>
          </aside>
        </div>
      )}

      {pendingCategory && (
        <TagPicker
          category={pendingCategory}
          onPick={(tag) => categorize(pendingCategory, tag)}
          onSkip={() => categorize(pendingCategory, undefined)}
          onCancel={() => setPendingCategory(null)}
        />
      )}
    </div>
  )
}
