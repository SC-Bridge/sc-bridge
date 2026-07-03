import { useSearchParams } from 'react-router-dom'
import SummaryCards from '../components/SummaryCards'
import ReportShell from './ReportShell'
import { NetLine } from './ReportChart'
import { useReportCashFlow } from '../hooks'
import { formatAUEC, toneBySign } from '../formatAUEC'
import { reportWindowFromParams } from './reportWindow'

export default function CashFlow() {
  const [params, setParams] = useSearchParams()
  // Always send from & to — fall back to the wide default when no params are set
  // so the API never sees an empty query string ("from and to are required" fix).
  const { qs } = reportWindowFromParams(params)
  const query = useReportCashFlow(qs)

  return (
    <ReportShell
      title="CASH FLOW"
      subtitle="In, out, and net liquidity over a period"
      query={query}
      params={params}
      onParams={(next) => setParams(next, { replace: true })}
      withInterval
    >
      {(data) => {
        // Aggregate summary totals from the series.
        const totalIn = data.series.reduce((s, r) => s + r.in, 0)
        const totalOut = data.series.reduce((s, r) => s + r.out, 0)
        const totalNet = totalIn + totalOut
        return (
          <>
            <SummaryCards cards={[
              { label: 'In', value: formatAUEC(totalIn, { short: true }), tone: 'positive' },
              { label: 'Out', value: formatAUEC(totalOut, { short: true }), tone: 'negative' },
              { label: 'Net', value: formatAUEC(totalNet), tone: toneBySign(totalNet) },
            ]} />
            {data.series.length === 0 ? (
              <div className="panel p-10 text-center text-gray-400">
                <p>No cash flow data for this period.</p>
              </div>
            ) : (
              <>
                <div className="panel p-4">
                  <NetLine data={data.series} />
                </div>
                <div className="panel p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
                        <th className="text-left py-2 pr-4">Bucket</th>
                        <th className="text-right py-2 pr-4">In</th>
                        <th className="text-right py-2 pr-4">Out</th>
                        <th className="text-right py-2">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.series.map((row) => (
                        <tr key={row.bucket} className="border-b border-sc-border/50">
                          <td className="py-1 pr-4 text-gray-300">{row.bucket}</td>
                          <td className="py-1 pr-4 text-right tabular-nums text-sc-success">{formatAUEC(row.in)}</td>
                          <td className="py-1 pr-4 text-right tabular-nums text-sc-danger">{formatAUEC(row.out)}</td>
                          <td className="py-1 text-right tabular-nums text-gray-200">{formatAUEC(row.net)}</td>
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
