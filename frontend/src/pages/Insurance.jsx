import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAnalysis, useStatus, useRsiAccounts } from '../hooks/useAPI'
import PrivacyMask from '../components/PrivacyMask'
import ShipImage from '../components/ShipImage'
import { Shield, ShieldAlert, ShieldQuestion, Calendar, Tag, Rocket } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import StatCard from '../components/StatCard'
import FilterSelect from '../components/FilterSelect'
import InsuranceBadge from '../components/InsuranceBadge'
import AccountMarker from '../components/AccountMarker'
import AccountFilter from '../components/AccountFilter'
import useAccountFilter from '../hooks/useAccountFilter'

/** "December 15, 2015" → "Dec 15, 2015" (fixed-width 3-char month) */
function formatPledgeDate(raw) {
  if (!raw) return raw
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

export default function Insurance() {
  const { data: appStatus, loading: statusLoading } = useStatus()
  const { data: rsiAccountsData, error: rsiAccountsError } = useRsiAccounts({ skip: !appStatus?.features?.multiAccount })
  const rsiAccounts = rsiAccountsData?.accounts
  const accountFilter = useAccountFilter(rsiAccounts)
  // Hold the analysis request until the account list has settled, so a plain
  // (all-accounts) request never races the narrowed one.
  const waitingForAccounts = statusLoading || (!!appStatus?.features?.multiAccount && !rsiAccountsData && !rsiAccountsError)
  const { data: analysis, loading: analysisLoading, error, refetch } = useAnalysis({ accounts: accountFilter.apiParam, skip: waitingForAccounts })
  const loading = analysisLoading || waitingForAccounts
  const [searchParams, setSearchParams] = useSearchParams()
  const filterLTI = searchParams.get('lti') || 'all'
  const filterWarbond = searchParams.get('warbond') || 'all'

  const ins = analysis?.insurance_summary
  const { lti, nonLTI, unknown } = useMemo(() => {
    const ltiShips = ins?.lti_ships || []
    const nonLTIShips = ins?.non_lti_ships || []
    const unknownShips = ins?.unknown_ships || []

    let allShips = [...ltiShips, ...nonLTIShips]

    if (filterLTI === 'lti') {
      allShips = allShips.filter(s => s.is_lifetime)
    } else if (filterLTI === 'nonlti') {
      allShips = allShips.filter(s => !s.is_lifetime)
    }

    if (filterWarbond === 'warbond') {
      allShips = allShips.filter(s => s.warbond)
    } else if (filterWarbond === 'nonwarbond') {
      allShips = allShips.filter(s => !s.warbond)
    }

    return {
      lti: allShips.filter(s => s.is_lifetime),
      nonLTI: allShips.filter(s => !s.is_lifetime),
      unknown: unknownShips
    }
  }, [ins, filterLTI, filterWarbond])

  if (loading) return <LoadingState message="Loading insurance data..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  // Empty fleet — mirror Dashboard/Insights illustrated empty-state pattern (F204).
  const totalShips = lti.length + nonLTI.length + unknown.length
  if (totalShips === 0) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader title="INSURANCE TRACKER" />
        <AccountFilter accounts={rsiAccounts} filter={accountFilter} />
        <div className="panel p-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-sc-accent/60" />
          <h2 className="font-display font-bold text-2xl text-white mb-2">No insurance data yet</h2>
          <p className="text-gray-400 text-base mb-6 max-w-md mx-auto">
            Sync your RSI hangar to see LTI coverage, pledge dates, and warbond status for every ship.
          </p>
          <Link to="/sync-import" className="btn-primary inline-flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Sync Your Fleet
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="INSURANCE TRACKER"
        subtitle="Sync your hangar to populate insurance info"
      />

      <AccountFilter accounts={rsiAccounts} filter={accountFilter} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <FilterSelect
          value={filterLTI}
          onChange={(e) => setSearchParams(prev => { e.target.value === 'all' ? prev.delete('lti') : prev.set('lti', e.target.value); return prev }, { replace: true })}
          options={[
            { value: 'all', label: 'All Insurance' },
            { value: 'lti', label: 'LTI Only' },
            { value: 'nonlti', label: 'Non-LTI Only' },
          ]}
        />
        <FilterSelect
          value={filterWarbond}
          onChange={(e) => setSearchParams(prev => { e.target.value === 'all' ? prev.delete('warbond') : prev.set('warbond', e.target.value); return prev }, { replace: true })}
          options={[
            { value: 'all', label: 'All Purchases' },
            { value: 'warbond', label: 'Warbond Only' },
            { value: 'nonwarbond', label: 'Non-Warbond Only' },
          ]}
        />
        <span className="text-xs font-mono text-gray-500">
          {lti.length + nonLTI.length} ships
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Shield} label="LTI Ships" value={lti.length} color="text-sc-lti" accentBorder="border-l-sc-lti" />
        <StatCard icon={ShieldAlert} label="Non-LTI Ships" value={nonLTI.length} color="text-sc-warn" accentBorder="border-l-sc-warn" />
        <StatCard icon={ShieldQuestion} label="Unknown" value={unknown.length} color="text-gray-500" accentBorder="border-l-gray-600" />
      </div>

      {/* LTI Ships */}
      {lti.length > 0 && (
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-sc-lti" />
            Lifetime Insurance ({lti.length})
          </div>
          <div className="divide-y divide-sc-border/50">
            {lti.map((ship, i) => (
              <InsuranceRow key={i} ship={ship} accounts={rsiAccounts} />
            ))}
          </div>
        </div>
      )}

      {/* Non-LTI Ships */}
      {nonLTI.length > 0 && (
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-sc-warn" />
            Non-LTI Ships ({nonLTI.length})
          </div>
          <div className="divide-y divide-sc-border/50">
            {nonLTI.map((ship, i) => (
              <InsuranceRow key={i} ship={ship} accounts={rsiAccounts} />
            ))}
          </div>
        </div>
      )}

      {/* Unknown Insurance */}
      {unknown.length > 0 && (
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <ShieldQuestion className="w-3.5 h-3.5 text-gray-500" />
            Insurance Unknown ({unknown.length})
          </div>
          <p className="px-5 py-2 text-xs text-gray-500">
            Sync your hangar from Sync & Import to populate insurance info for these ships.
          </p>
          <div className="divide-y divide-sc-border/50">
            {unknown.map((ship, i) => (
              <div key={i} className="relative px-5 py-3 flex items-center gap-3">
                <ShipImage render={ship.render} src={ship.image_url} alt={ship.ship_name} aspectRatio="thumbnail" className="w-12 rounded border border-sc-border/50 shrink-0" />
                <span className="text-sm text-gray-400">{ship.ship_name}</span>
                {ship.custom_name && (
                  <span className="text-xs text-gray-400 italic">"{ship.custom_name}"</span>
                )}
                <AccountMarker rsiAccountId={ship.rsi_account_id} accounts={rsiAccounts} variant="row" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InsuranceRow({ ship, accounts }) {
  return (
    <div className="relative px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <ShipImage render={ship.render} src={ship.image_url} alt={ship.ship_name} aspectRatio="thumbnail" className="w-12 rounded border border-sc-border/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{ship.ship_name}</span>
          {ship.custom_name && (
            <span className="text-xs text-gray-500 italic truncate">"{ship.custom_name}"</span>
          )}
        </div>
        {ship.pledge_name && (
          <div className="flex items-center gap-1 mt-0.5">
            <Tag className="w-3 h-3 text-gray-500" />
            <span className="text-[11px] font-mono text-gray-400 truncate">{ship.pledge_name}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="w-20 text-right text-xs font-mono text-gray-400">
          {(() => {
            if (!ship.pledge_cost) return <span className="text-gray-600">N/A</span>
            const raw = ship.pledge_cost.trim()
            if (raw.includes('¤') || raw.toUpperCase().includes('UEC')) {
              return <span className="text-gray-600">aUEC</span>
            }
            const m = raw.match(/\$\s*([\d,]+(?:\.\d+)?)/)
            if (!m) return <span className="text-gray-600">N/A</span>
            const num = parseFloat(m[1].replace(/,/g, ''))
            if (!num || num === 0) return <span className="text-gray-600">Gift</span>
            return <span className="flex items-center gap-1 justify-end"><PrivacyMask placeholder="$•••" value={Math.round(num)}>${Math.round(num).toLocaleString('en-US')}</PrivacyMask></span>
          })()}
        </span>
        <span className="w-44 text-right text-xs font-mono text-gray-500 whitespace-nowrap">
          {ship.pledge_date && (
            <span className="flex items-center gap-1 justify-end"><Calendar className="w-3 h-3" />{formatPledgeDate(ship.pledge_date)}</span>
          )}
        </span>
        <span className="w-10 flex items-center justify-center shrink-0">
          {!!ship.warbond && <span className="badge badge-warbond">WB</span>}
        </span>
        <span className="w-20 text-right text-xs font-mono text-gray-500">
          {ship.claim_time != null ? `${ship.claim_time}m` : ''}
        </span>
        <span className="w-24 shrink-0">
          <InsuranceBadge isLifetime={ship.is_lifetime} label={ship.insurance_label || (ship.is_lifetime ? 'LTI' : 'Standard')} />
        </span>
      </div>
      <AccountMarker rsiAccountId={ship.rsi_account_id} accounts={accounts} variant="row" />
    </div>
  )
}
