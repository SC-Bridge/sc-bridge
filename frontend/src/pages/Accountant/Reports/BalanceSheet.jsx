import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import PeriodSelector from '../components/PeriodSelector'
import SummaryCards from '../components/SummaryCards'
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
  const { data, error, loading, refetch } = useReportBalance(`at=${encodeURIComponent(at)}`)

  function onPeriod(next) { setParams(next) }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader title="BALANCE SHEET" subtitle="Assets, liabilities, and equity at a point in time" />
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="BALANCE SHEET" subtitle="Assets, liabilities, and equity at a point in time" />
      <div className="panel p-4"><PeriodSelector params={params} onChange={onPeriod} /></div>
      {loading && !data ? <LoadingState /> : data && (
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
    </div>
  )
}
