import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import PeriodSelector from '../components/PeriodSelector'
import IntervalSelector from '../components/IntervalSelector'

/**
 * ReportShell — shared chrome for the four report pages (Net Worth, Cash Flow,
 * P&L, Balance Sheet): header, period/interval selectors, error + retry,
 * loading gate. Children is a render prop called with the loaded data, so page
 * bodies never have to guard against null themselves.
 */
export default function ReportShell({
  title,
  subtitle,
  query, // { data, error, loading, refetch } from a useReport* hook
  params,
  onParams,
  withInterval = false,
  periodToOnly = false, // as-of mode for point-in-time reports (Balance Sheet)
  children,
}) {
  const { data, error, loading, refetch } = query
  const header = <PageHeader title={title} subtitle={subtitle} />

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        {header}
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {header}
      <div className={withInterval ? 'panel p-4 space-y-3' : 'panel p-4'}>
        <PeriodSelector params={params} onChange={onParams} toOnly={periodToOnly} />
        {withInterval && (
          <div className="border-t border-sc-border pt-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-2">Interval</span>
            <IntervalSelector params={params} onChange={onParams} />
          </div>
        )}
      </div>
      {loading && !data ? <LoadingState /> : data && children(data)}
    </div>
  )
}
