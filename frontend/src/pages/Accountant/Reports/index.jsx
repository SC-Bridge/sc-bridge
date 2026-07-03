import { Link } from 'react-router-dom'
import { TrendingUp, Scale, Wallet, ArrowRightLeft } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import { formatAUEC } from '../formatAUEC'
import { useReportPL, useReportBalance, useReportCashFlow } from '../hooks'
import { DEFAULT_FROM, DEFAULT_TO } from './reportWindow'

// All-time window: epoch start → a fixed far-future sentinel (DEFAULT_TO is the
// 2999-01-01 constant, not a runtime-relative date). Shared with the report
// pages via reportWindow.js so there is exactly one source of truth for it.
const WIDE_QS = new URLSearchParams({ from: DEFAULT_FROM, to: DEFAULT_TO }).toString()
const BAL_QS = new URLSearchParams({ at: DEFAULT_TO }).toString()

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
