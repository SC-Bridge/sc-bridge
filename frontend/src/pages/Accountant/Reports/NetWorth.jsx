import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import PeriodSelector from '../components/PeriodSelector'
import SummaryCards from '../components/SummaryCards'
import { GradientArea } from './ReportChart'
import { useReportNetWorth } from '../hooks'
import { formatAUEC, toneBySign } from '../formatAUEC'

export default function NetWorth() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading } = useReportNetWorth(params.toString())

  function onPeriod(next) { setParams(next) }

  // Current equity = last point in series; delta vs period start (opening).
  const lastPoint = data?.series?.at(-1)
  const currentEquity = lastPoint?.netWorth ?? data?.opening ?? 0
  const delta = data ? currentEquity - (data.opening ?? 0) : 0

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="NET WORTH" subtitle="Cumulative equity over time" />
      <div className="panel p-4"><PeriodSelector params={params} onChange={onPeriod} /></div>
      {error && <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>}
      {loading && !data ? <LoadingState /> : data && (
        <>
          <SummaryCards cards={[
            { label: 'Current equity', value: formatAUEC(currentEquity), tone: toneBySign(currentEquity) },
            { label: 'Δ vs period start', value: formatAUEC(delta), tone: toneBySign(delta) },
          ]} />
          <div className="panel p-4">
            <GradientArea data={data.series} />
          </div>
          {data.series.length > 0 && (
            <div className="panel p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
                    <th className="text-left py-2 pr-4">Bucket</th>
                    <th className="text-right py-2">Net Worth</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row) => (
                    <tr key={row.bucket} className="border-b border-sc-border/50">
                      <td className="py-1 pr-4 text-gray-300">{row.bucket}</td>
                      <td className="py-1 text-right tabular-nums text-gray-200">{formatAUEC(row.netWorth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
