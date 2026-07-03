import { useSearchParams } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import ReportShell from './ReportShell'
import { StatementSection } from './StatementSection'
import { GroupedBars, CategoryDonut } from './ReportChart'
import { drillToLedger } from './drill'
import { useReportPL } from '../hooks'
import { formatAUEC, toneBySign } from '../formatAUEC'
import { reportWindowFromParams } from './reportWindow'

export default function PL() {
  const [params, setParams] = useSearchParams()
  // Always send from & to — fall back to the wide default when no params are set
  // so the API never sees an empty query string ("from and to are required" fix).
  const { qs } = reportWindowFromParams(params)
  const query = useReportPL(qs)

  return (
    <ReportShell
      title="PROFIT & LOSS"
      subtitle="Revenue vs expenses over a period"
      query={query}
      params={params}
      onParams={(next) => setParams(next, { replace: true })}
    >
      {(data) => (
        <>
          <SummaryCards cards={[
            { label: 'Revenue', value: formatAUEC(data.revenue.total, { short: true }), tone: 'positive' },
            { label: 'Expenses', value: formatAUEC(data.expenses.total, { short: true }), tone: 'negative' },
            { label: 'Net', value: formatAUEC(data.net), tone: toneBySign(data.net),
              sub: data.revenue.total ? `${Math.round((data.net / data.revenue.total) * 100)}% margin` : undefined },
          ]} />
          <div className="grid grid-cols-2 gap-4">
            <div className="panel p-4"><GroupedBars data={[{ bucket: 'Period', in: data.revenue.total, out: data.expenses.total }]} /></div>
            <div className="panel p-4"><CategoryDonut data={data.expenses.lines.map((l) => ({ name: l.label, value: Math.abs(l.value) }))} /></div>
          </div>
          <StatementSection title="Revenue" rows={[
            ...data.revenue.lines.map((l) => ({
              label: l.label, value: l.value, drillHref: drillToLedger(l.drill),
              subPct: data.revenue.total ? Math.round((l.value / data.revenue.total) * 100) : undefined,
            })),
            { label: 'Total revenue', value: data.revenue.total, total: true },
          ]} />
          <StatementSection title="Expenses" rows={[
            ...data.expenses.lines.map((l) => ({
              label: l.tag ? `${l.label} — ${l.tag}` : l.label, value: l.value, indent: !!l.tag, drillHref: drillToLedger(l.drill),
            })),
            { label: 'Total expenses', value: data.expenses.total, total: true },
          ]} />
        </>
      )}
    </ReportShell>
  )
}
