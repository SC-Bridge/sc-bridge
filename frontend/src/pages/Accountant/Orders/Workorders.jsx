import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { STATUS_LABELS, WORKORDER_STATUSES } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import { useWorkorders } from '../hooks'
import { woRef } from '../orderMath'

function StatusFilter({ params, onChange }) {
  function toggle(value, active) {
    const next = new URLSearchParams(params)
    const current = next.getAll('status')
    next.delete('status')
    const updated = active ? current.filter((v) => v !== value) : [...current, value]
    for (const v of updated) next.append('status', v)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-3" data-testid="workorder-filters">
      {WORKORDER_STATUSES.map((s) => {
        const active = params.getAll('status').includes(s)
        return (
          <label key={s} className="flex items-center gap-1.5 text-sm text-gray-300">
            <input type="checkbox" checked={active} onChange={() => toggle(s, active)} />
            {STATUS_LABELS[s]}
          </label>
        )
      })}
    </div>
  )
}

function WorkorderTable({ workorders }) {
  const navigate = useNavigate()
  return (
    <table className="w-full text-sm" data-testid="workorder-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Title</th>
          <th className="py-2 pr-3">Counterparty</th>
          <th className="py-2 pr-3 text-right">Components</th>
          <th className="py-2 pr-3 text-right">Net total</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {workorders.map((w) => (
          <tr key={w.id}
            onClick={() => navigate(`/accountant/orders/workorders/${w.id}`)}
            className="border-b border-sc-border/40 hover:bg-white/5 cursor-pointer">
            <td className="py-2 pr-3 text-gray-400">{woRef(w.id)}</td>
            <td className="py-2 pr-3 text-white">{w.title}</td>
            <td className="py-2 pr-3 text-gray-300">{w.counterparty ?? '—'}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-gray-300">
              {w.completedCount > 0 ? `${w.completedCount}/${w.componentCount}` : w.componentCount}
            </td>
            <td className={`py-2 pr-3 text-right tabular-nums ${signClass(w.netTotal)}`}>
              {w.netTotal > 0 ? '+' : ''}{formatAUEC(w.netTotal)}
            </td>
            <td className="py-2 text-gray-400">{STATUS_LABELS[w.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Workorders() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, refetch } = useWorkorders(params.toString())

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="mt-3 text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  const { workorders, total } = data
  // Distinguish "nothing matches the active filters" from a truly empty
  // account — the CTA hero only makes sense for the latter (Market's
  // filtered-empty heuristic, mirrored).
  const filtered = params.getAll('status').length > 0

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="WORKORDERS"
        subtitle="Multi-order agreements composed from component orders under one contract"
        actions={
          <Link to="/accountant/orders/workorders/new"
            className="flex items-center gap-1.5 bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
            <Plus className="w-4 h-4" /> New Workorder
          </Link>
        }
      />

      {/* replace: status-filter toggles shouldn't stack Back-button history. */}
      <StatusFilter params={params} onChange={(next) => setParams(next, { replace: true })} />

      {total === 0 && filtered ? (
        <div className="panel p-10 text-center text-gray-400">
          <p>No workorders match these filters.</p>
        </div>
      ) : total === 0 ? (
        <div className="panel p-10 text-center text-gray-400">
          <p className="mb-3">No workorders yet.</p>
          <Link to="/accountant/orders/workorders/new" className="text-sc-accent text-sm">
            Create your first workorder
          </Link>
        </div>
      ) : (
        <WorkorderTable workorders={workorders} />
      )}
    </div>
  )
}
