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
        <FilterPanel params={params} onChange={setParams} />
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
          <p className="mt-3 text-sm text-gray-500">
            Showing {entries.length} of {total} entries
          </p>
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
