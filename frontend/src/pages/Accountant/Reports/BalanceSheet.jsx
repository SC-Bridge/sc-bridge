import { useSearchParams } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import ReportShell from './ReportShell'
import { StatementSection } from './StatementSection'
import { CategoryDonut } from './ReportChart'
import { useReportBalance } from '../hooks'
import { formatAUEC } from '../formatAUEC'
import { reportWindowFromParams } from './reportWindow'

export default function BalanceSheet() {
  const [params, setParams] = useSearchParams()
  // Derive `at` from the stable window helper — same URL params → same string →
  // useGet does not fire a new fetch → no infinite loop.
  const { to: at } = reportWindowFromParams(params)
  const query = useReportBalance(`at=${encodeURIComponent(at)}`)

  return (
    <ReportShell
      title="BALANCE SHEET"
      subtitle="Assets, liabilities, and equity at a point in time"
      query={query}
      params={params}
      onParams={setParams}
    >
      {(data) => (
        <>
          <SummaryCards cards={[
            { label: 'Net Worth', value: formatAUEC(data.equity), tone: 'neutral' },
            { label: 'Assets', value: formatAUEC(data.assets), tone: 'positive' },
            { label: 'Liabilities', value: formatAUEC(data.liabilities), tone: 'negative' },
          ]} />
          <div className="panel p-4">
            <CategoryDonut data={[
              { name: 'Assets', value: data.assets },
              { name: 'Liabilities', value: data.liabilities },
            ]} />
          </div>
          <StatementSection title="Assets" rows={[
            { label: 'Cash', value: data.cash },
            { label: 'Holdings (cost basis)', value: data.holdings },
            // M5 memo line: open PO reserves. Display only — the server already
            // adds this back into equity (equity = cash + holdings + lockedInPOs).
            ...(data.lockedInPOs != null
              ? [{ label: 'Locked in POs', value: data.lockedInPOs, indent: true }]
              : []),
            { label: 'Total assets', value: data.assets, total: true },
          ]} />
          <StatementSection title="Liabilities" rows={[
            { label: 'Total liabilities', value: -data.liabilities, total: true },
          ]} />
          <StatementSection title="Equity" rows={[
            { label: 'Equity (assets − liabilities)', value: data.equity, total: true },
          ]} />
        </>
      )}
    </ReportShell>
  )
}
