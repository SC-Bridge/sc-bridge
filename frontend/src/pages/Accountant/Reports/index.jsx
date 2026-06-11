import { Link } from 'react-router-dom'
import { TrendingUp, Scale, Wallet, ArrowRightLeft } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import { formatAUEC } from '../formatAUEC'
import { useReportPL, useReportBalance, useReportCashFlow } from '../hooks'

// All-time window: epoch start → tomorrow. Computed once at module load.
const _to = new Date(Date.now() + 86_400_000).toISOString()
const WIDE_QS = new URLSearchParams({ from: '1970-01-01T00:00:00Z', to: _to }).toString()
const BAL_QS = new URLSearchParams({ at: _to }).toString()

export default function ReportsLanding() {
  const pl = useReportPL(WIDE_QS)
  const bal = useReportBalance(BAL_QS)
  const cf = useReportCashFlow(WIDE_QS)
  const cashNet = (cf.data?.series ?? []).reduce((s, b) => s + (b.net ?? 0), 0)

  const tiles = [
    { to: '/accountant/reports/pl', icon: TrendingUp, label: 'Profit & Loss', figure: pl.data ? formatAUEC(pl.data.net, { short: true }) : '—' },
    { to: '/accountant/reports/balance', icon: Scale, label: 'Balance Sheet', figure: bal.data ? formatAUEC(bal.data.equity, { short: true }) : '—' },
    { to: '/accountant/reports/net-worth', icon: Wallet, label: 'Net Worth', figure: bal.data ? formatAUEC(bal.data.equity, { short: true }) : '—' },
    { to: '/accountant/reports/cash-flow', icon: ArrowRightLeft, label: 'Cash Flow', figure: cf.data ? formatAUEC(cashNet, { short: true }) : '—' },
  ]
  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="REPORTS" subtitle="Read-only derived views over your ledger" />
      <div className="grid grid-cols-2 gap-4">
        {tiles.map(({ to, icon: Icon, label, figure }) => (
          <Link key={to} to={to} className="panel p-5 hover:bg-white/5 flex items-center justify-between">
            <span className="flex items-center gap-3 text-gray-200"><Icon className="w-5 h-5 text-sc-accent" />{label}</span>
            <span className="text-lg font-semibold text-white tabular-nums">{figure}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
