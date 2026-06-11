import { useNavigate } from 'react-router-dom'
import { formatAUEC } from '../formatAUEC'
import { INTERVAL_SHORT } from '../loanMath'

export default function LoanTable({ loans, onSelect }) {
  const navigate = useNavigate()
  return (
    <table className="w-full text-sm" data-testid="loan-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Counterparty</th>
          <th className="py-2 pr-3 text-right">Principal</th>
          <th className="py-2 pr-3 text-right">Outstanding</th>
          <th className="py-2">Interest</th>
        </tr>
      </thead>
      <tbody>
        {loans.map((l) => (
          <tr key={l.id}
            onClick={() => (onSelect ? onSelect(l) : navigate(`/accountant/loans/${l.id}`))}
            className="border-b border-sc-border/40 hover:bg-white/5 cursor-pointer">
            <td className="py-2 pr-3 text-gray-400">L-{String(l.id).padStart(4, '0')}</td>
            <td className="py-2 pr-3 text-white">{l.counterparty}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-gray-300">{formatAUEC(l.principal)}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-white">
              {l.status === 'settled' ? <span className="text-sc-success">settled</span> : formatAUEC(l.outstanding)}
            </td>
            <td className="py-2 text-gray-400">+{l.interest_rate}%{INTERVAL_SHORT[l.interest_interval]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
