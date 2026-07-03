import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { useLedger } from '../hooks'
import { formatAUEC, toneBySign } from '../formatAUEC'
import FilterPanel, { DEFAULT_SOURCES } from './FilterPanel'
import EntryTable from './EntryTable'
import EntryDetail from './EntryDetail'
import AddEntryModal from './AddEntryModal'
import SummaryCards from '../components/SummaryCards'

// Mirrors the backend PER_PAGE in routes/accountant/ledger.ts — the server
// pages at 50 and only echoes the requested page, so the client derives the
// page count from total / this size.
const PAGE_SIZE = 50

function buildQuery(params) {
  const query = new URLSearchParams(params)
  // accrual_tick hidden by default (locked UX decision): when the user hasn't
  // chosen sources explicitly, request the default set.
  if (!query.getAll('source').length) {
    for (const s of DEFAULT_SOURCES) query.append('source', s)
  }
  return query.toString()
}

export default function Ledger() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, refetch } = useLedger(buildQuery(params))
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)

  // Any filter/period/search change must return to page 1 — staying on page 7
  // after a filter trims the result set to one page would show an empty list.
  // replace: filtering/paging shouldn't stack Back-button history entries.
  function changeFilters(next) {
    next.delete('page')
    setParams(next, { replace: true })
  }

  function goToPage(p) {
    const next = new URLSearchParams(params)
    if (p <= 1) next.delete('page')
    else next.set('page', String(p))
    setParams(next, { replace: true })
  }

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="mt-3 text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  const { entries, total, balance, sum_income = 0, sum_expense = 0 } = data
  const net = sum_income + sum_expense

  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = (page - 1) * PAGE_SIZE + entries.length

  const summaryCards = [
    {
      label: 'Balance',
      value: formatAUEC(balance, { short: true }),
      sub: 'all time',
      tone: toneBySign(balance),
    },
    {
      label: 'Income',
      value: formatAUEC(sum_income, { short: true }),
      tone: 'positive',
    },
    {
      label: 'Expenses',
      value: formatAUEC(sum_expense, { short: true }),
      tone: 'negative',
    },
    {
      label: 'Net',
      value: formatAUEC(net, { short: true }),
      sub: 'current filters',
      tone: toneBySign(net),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="LEDGER"
        subtitle="Every transaction, one source of truth"
        actions={
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30"
          >
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        }
      />

      <SummaryCards cards={summaryCards} />

      <div className="flex gap-6">
        <FilterPanel params={params} onChange={changeFilters} />
        <div className="flex-1 min-w-0">
          {total === 0 ? (
            <div className="panel p-10 text-center text-gray-400">
              <p className="mb-3">Nothing here yet.</p>
              <button onClick={() => setAdding(true)} className="text-sc-accent text-sm">
                Record your first transaction
              </button>
            </div>
          ) : (
            <EntryTable entries={entries} onSelect={setSelected} />
          )}
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              {total === 0
                ? 'No entries'
                : `Showing ${rangeStart}–${rangeEnd} of ${total} entries`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-sc-border text-gray-300 hover:bg-sc-darker disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-gray-400 tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-sc-border text-gray-300 hover:bg-sc-darker disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <EntryDetail
          entry={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); refetch() }}
        />
      )}
      {adding && (
        <AddEntryModal
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refetch() }}
        />
      )}
    </div>
  )
}
