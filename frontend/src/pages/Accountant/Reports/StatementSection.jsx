import { Link } from 'react-router-dom'
import { formatAUEC } from '../formatAUEC'

// StatementRow contract (presentation design): { label, value, subPct?, indent?, total?, drillHref? }
export function StatementRow({ label, value, subPct, indent, total, drillHref }) {
  const labelEl = drillHref
    ? <Link to={drillHref} className="text-sc-accent hover:underline">{label}</Link>
    : <span className={total ? 'text-white font-semibold' : 'text-gray-300'}>{label}</span>
  return (
    <div className={`flex justify-between items-baseline py-1 ${total ? 'border-t border-sc-border mt-1 pt-2' : ''} ${indent ? 'pl-4' : ''}`}>
      <span className="text-sm">{labelEl}</span>
      <span className="flex items-baseline gap-2">
        {subPct != null && <span className="text-xs text-gray-600 tabular-nums">{subPct}%</span>}
        <span className={`text-sm tabular-nums ${total ? 'text-white font-semibold' : 'text-gray-200'}`}>{formatAUEC(value)}</span>
      </span>
    </div>
  )
}

export function StatementSection({ title, rows }) {
  return (
    <div className="panel p-4">
      <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
      <div>{rows.map((r, i) => <StatementRow key={r.label + i} {...r} />)}</div>
    </div>
  )
}
