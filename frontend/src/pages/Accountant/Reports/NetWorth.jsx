import { useSearchParams } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import ReportShell from './ReportShell'
import { GradientArea } from './ReportChart'
import { useReportNetWorth } from '../hooks'
import { formatAUEC, toneBySign } from '../formatAUEC'
import { reportWindowFromParams } from './reportWindow'

export default function NetWorth() {
  const [params, setParams] = useSearchParams()
  // Always send from & to — fall back to the wide default when no params are set
  // so the API never sees an empty query string ("from and to are required" fix).
  const { qs } = reportWindowFromParams(params)
  const query = useReportNetWorth(qs)

  return (
    <ReportShell
      title="NET WORTH"
      subtitle="Cumulative equity over time"
      query={query}
      params={params}
      onParams={setParams}
      withInterval
    >
      {(data) => {
        // Current equity = last point in series; delta vs period start (opening).
        const lastPoint = data.series.at(-1)
        const currentEquity = lastPoint?.netWorth ?? data.opening ?? 0
        const delta = currentEquity - (data.opening ?? 0)
        return (
          <>
            <SummaryCards cards={[
              { label: 'Current equity', value: formatAUEC(currentEquity), tone: toneBySign(currentEquity) },
              { label: 'Δ vs period start', value: formatAUEC(delta), tone: toneBySign(delta) },
            ]} />
            {data.series.length === 0 ? (
              <div className="panel p-10 text-center text-gray-400">
                <p>No net worth data for this period.</p>
              </div>
            ) : (
              <>
                <div className="panel p-4">
                  <GradientArea data={data.series} />
                </div>
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
              </>
            )}
          </>
        )
      }}
    </ReportShell>
  )
}
