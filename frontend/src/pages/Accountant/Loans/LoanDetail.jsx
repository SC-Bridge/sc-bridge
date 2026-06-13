import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { useLoan, settleLoan } from '../hooks'
import { formatAUEC } from '../formatAUEC'
import { INTERVAL_LABELS } from '../loanMath'
import RepaymentModal from './RepaymentModal'
import ForgiveModal from './ForgiveModal'

export default function LoanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, refetch } = useLoan(id)
  const [repaying, setRepaying] = useState(false)
  const [forgiving, setForgiving] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={() => navigate('/accountant/loans')} className="mt-3 text-sm text-sc-accent">Back to loans</button>
      </div>
    )
  }

  const { loan, outstanding, accrued, fee, repayments, forgiveness = [], preview } = data
  const settled = loan.status === 'settled'

  async function doSettle() {
    if (!window.confirm('Close this loan? Any remaining outstanding becomes a write-off.')) return
    setActionError(null)
    try {
      await settleLoan(loan.id)
      refetch()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <button onClick={() => navigate('/accountant/loans')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300">
        <ArrowLeft className="w-4 h-4" /> Back to loans
      </button>
      <PageHeader title={`LOAN L-${String(loan.id).padStart(4, '0')}`} subtitle={loan.counterparty} />

      <div className="panel p-4 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-500">Direction</span><div className="text-white capitalize">{loan.direction}</div></div>
        <div><span className="text-gray-500">Interest</span><div className="text-white">{loan.interest_rate}% · {INTERVAL_LABELS[loan.interest_interval]}</div></div>
        <div><span className="text-gray-500">Principal</span><div className="text-white">{formatAUEC(loan.principal)}</div></div>
        <div><span className="text-gray-500">Fee (booked)</span><div className="text-white">{formatAUEC(fee)}</div></div>
        <div><span className="text-gray-500">Accrued to date</span><div className="text-white">{formatAUEC(accrued)}</div></div>
      </div>

      {!settled && (
        <div className="panel p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Accrual schedule</h3>
          <p className="text-sm text-gray-300">Next tick: <span className="text-white">{new Date(preview.nextTickAt).toLocaleString()}</span></p>
          <p className="text-sm text-gray-300">Projected next tick: <span className="text-white">{formatAUEC(preview.projectedAmount)}</span></p>
          <p className="text-sm text-gray-300">Payback total: <span className="text-white">{formatAUEC(preview.paybackTotal)}</span></p>
        </div>
      )}

      <div className="panel p-4">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Repayments</h3>
        {repayments.length === 0 ? (
          <p className="text-sm text-gray-500">None yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {repayments.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span className="text-gray-400">{new Date(r.occurred_at).toLocaleDateString()}</span>
                <span className="text-sc-success tabular-nums">{formatAUEC(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {forgiveness.length > 0 && (
        <div className="panel p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Forgiveness</h3>
          <ul className="space-y-1 text-sm">
            {forgiveness.map((f) => (
              <li key={f.id} className="flex justify-between">
                <span className="text-gray-400">
                  {new Date(f.occurred_at).toLocaleDateString()}
                  {f.notes ? <span className="text-gray-500"> · {f.notes}</span> : null}
                </span>
                <span className="text-amber-400 tabular-nums">{formatAUEC(f.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionError && <div role="alert" className="panel p-4 text-sc-danger text-sm">{actionError}</div>}

      <p className="text-lg">Outstanding: <span className="text-white tabular-nums">{settled ? formatAUEC(0) : formatAUEC(outstanding)}</span></p>
      {settled && outstanding > 0 && (
        <p className="text-sm text-gray-500">Written off: {formatAUEC(outstanding)}</p>
      )}

      {!settled && (
        <div className="flex gap-2">
          <button onClick={() => setRepaying(true)}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30">
            Record repayment
          </button>
          <button onClick={() => setForgiving(true)}
            className="border border-sc-border text-gray-300 rounded px-4 py-1.5 text-sm hover:bg-white/5">
            Forgive…
          </button>
          <button onClick={doSettle}
            className="border border-sc-border text-gray-300 rounded px-4 py-1.5 text-sm hover:bg-white/5">
            Close loan
          </button>
        </div>
      )}

      {repaying && (
        <RepaymentModal
          loan={{ id: loan.id, counterparty: loan.counterparty, outstanding }}
          onClose={() => setRepaying(false)}
          onSaved={() => { setRepaying(false); refetch() }}
        />
      )}
      {forgiving && (
        <ForgiveModal
          loan={{ id: loan.id, counterparty: loan.counterparty, outstanding, direction: loan.direction }}
          onClose={() => setForgiving(false)}
          onSaved={() => { setForgiving(false); refetch() }}
        />
      )}
    </div>
  )
}
