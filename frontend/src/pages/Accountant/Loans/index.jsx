import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { useLoans } from '../hooks'
import LoanTable from './LoanTable'
import NewLoanModal from './NewLoanModal'
import InvestmentBanner from '../Reports/InvestmentBanner'

export default function Loans() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'incoming' ? 'incoming' : 'outgoing'
  const { data, error, loading, refetch } = useLoans()
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

  const loans = data.loans ?? []
  const outgoing = loans.filter((l) => l.direction === 'outgoing')
  const incoming = loans.filter((l) => l.direction === 'incoming')
  const shown = tab === 'incoming' ? incoming : outgoing

  function setTab(next) {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    setParams(p)
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <InvestmentBanner />
      <PageHeader
        title="LOANS"
        subtitle="Outgoing receivables and incoming liabilities, with live interest accrual"
        actions={
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30">
            <Plus className="w-4 h-4" /> New Loan
          </button>
        }
      />

      <div className="flex gap-2">
        <button onClick={() => setTab('outgoing')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'outgoing' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-400 hover:text-gray-300'}`}>
          Outgoing ({outgoing.length})
        </button>
        <button onClick={() => setTab('incoming')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'incoming' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-400 hover:text-gray-300'}`}>
          Incoming ({incoming.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="panel p-10 text-center text-gray-400">
          <p className="mb-3">No loans yet.</p>
          <button onClick={() => setAdding(true)} className="text-sc-accent text-sm">Create your first loan</button>
        </div>
      ) : (
        <LoanTable loans={shown} />
      )}

      {adding && <NewLoanModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refetch() }} />}
    </div>
  )
}
