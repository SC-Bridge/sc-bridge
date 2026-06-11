import { useState } from 'react'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { useLedger } from '../hooks'
import { formatAUEC, signClass } from '../formatAUEC'
import AddEntryModal from '../Ledger/AddEntryModal'

// Tactical investments are plain financial/tactical ledger entries (design §4.3) —
// this page is a filtered view + a preset AddEntryModal. No dedicated endpoints.
const QUERY = 'category=financial&tag=tactical'

export default function Tactical() {
  const { data, error, loading, refetch } = useLedger(QUERY)
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

  const entries = data.entries ?? []

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="TACTICAL"
        subtitle="One-way investments — donations, headhunter fees, debt enforcement. No repayment expected."
        actions={
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
            <Plus className="w-4 h-4" /> New Tactical
          </button>
        }
      />

      {entries.length === 0 ? (
        <div className="panel p-10 text-center text-gray-400">
          <p className="mb-3">No tactical investments yet.</p>
          <button onClick={() => setAdding(true)} className="text-sc-accent text-sm">Record your first tactical investment</button>
        </div>
      ) : (
        <table className="w-full text-sm" data-testid="tactical-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-sc-border/40">
                <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{new Date(e.occurred_at).toLocaleDateString()}</td>
                <td className="py-2 pr-3 text-white">{e.description ?? '—'}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${signClass(e.amount)}`}>{formatAUEC(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddEntryModal
          preset={{ direction: 'expense', category: 'financial', tag: 'tactical' }}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refetch() }}
        />
      )}
    </div>
  )
}
