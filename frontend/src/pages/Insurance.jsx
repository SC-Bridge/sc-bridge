import React, { useState, useMemo } from 'react'
import { useAnalysis } from '../hooks/useAPI'
import { Shield, ShieldAlert, ShieldQuestion, Calendar, DollarSign, Tag } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import StatCard from '../components/StatCard'
import FilterSelect from '../components/FilterSelect'
import InsuranceBadge from '../components/InsuranceBadge'

export default function Insurance() {
  const { data: analysis, loading, error, refetch } = useAnalysis()
  const [filterLTI, setFilterLTI] = useState('all')
  const [filterWarbond, setFilterWarbond] = useState('all')

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="INSURANCE TRACKER"
        subtitle="Upload HangarXplor data to populate insurance info"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <FilterSelect
          value={filterLTI}
          onChange={(e) => setFilterLTI(e.target.value)}
          options={[
            { value: 'all', label: 'All Insurance' },
            { value: 'lti', label: 'LTI Only' },
            { value: 'nonlti', label: 'Non-LTI Only' },
          ]}
        />
        <FilterSelect
          value={filterWarbond}
          onChange={(e) => setFilterWarbond(e.target.value)}
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
              <InsuranceRow key={i} ship={ship} />
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
              <InsuranceRow key={i} ship={ship} />
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
            Upload HangarXplor data to populate insurance info for these ships.
          </p>
          <div className="divide-y divide-sc-border/50">
            {unknown.map((ship, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm text-gray-400">{ship.ship_name}</span>
                {ship.custom_name && (
                  <span className="text-xs text-gray-400 italic">"{ship.custom_name}"</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InsuranceRow({ ship }) {
  return (
    <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
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
      <div className="flex items-center gap-3 flex-wrap">
        {ship.pledge_cost && (
          <span className="flex items-center gap-1 text-xs font-mono text-gray-400">
            <DollarSign className="w-3 h-3" />
            {ship.pledge_cost}
          </span>
        )}
        {ship.pledge_date && (
          <span className="flex items-center gap-1 text-xs font-mono text-gray-500">
            <Calendar className="w-3 h-3" />
            {ship.pledge_date}
          </span>
        )}
        <InsuranceBadge isLifetime={ship.is_lifetime} label={ship.insurance_label || (ship.is_lifetime ? 'LTI' : 'Standard')} />
        {ship.warbond && <span className="badge badge-warbond">WB</span>}
      </div>
    </div>
  )
}
