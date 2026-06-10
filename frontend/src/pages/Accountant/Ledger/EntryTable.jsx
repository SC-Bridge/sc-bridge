import { CATEGORY_LABELS, SOURCE_LABELS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'

export default function EntryTable({ entries, onSelect }) {
  return (
    <table className="w-full text-sm" data-testid="ledger-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
          <th className="py-2 pr-3">Date</th>
          <th className="py-2 pr-3">Description</th>
          <th className="py-2 pr-3">Category</th>
          <th className="py-2 pr-3 text-right">Amount</th>
          <th className="py-2">Source</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={e.id}
            onClick={() => onSelect(e)}
            className="border-b border-sc-border/40 hover:bg-white/5 cursor-pointer"
          >
            <td className="py-2 pr-3 whitespace-nowrap text-gray-400">
              {new Date(e.occurred_at).toLocaleString()}
            </td>
            <td className="py-2 pr-3 text-white">{e.description ?? '—'}</td>
            <td className="py-2 pr-3 text-gray-300">
              {e.category ? CATEGORY_LABELS[e.category] : <span className="text-sc-warn">Unsorted</span>}
            </td>
            <td className={`py-2 pr-3 text-right tabular-nums ${signClass(e.amount)}`}>
              {formatAUEC(e.amount)}
            </td>
            <td className="py-2 text-gray-500">{SOURCE_LABELS[e.source] ?? e.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
