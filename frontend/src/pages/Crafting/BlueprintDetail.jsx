import React, { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, Layers, FlaskConical, Crosshair, Zap, Target, MapPin, Gift, FileText, Lock } from 'lucide-react'
import { useCrafting } from '../../hooks/useAPI'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import SlotCard from './SlotCard'
import QualitySim from './QualitySim'
import { TYPE_LABELS, SUBTYPE_LABELS, TYPE_COLORS, formatTime, humanizeLocationName } from './craftingUtils'

const TABS = [
  { key: 'materials', label: 'Materials' },
  { key: 'quality', label: 'Quality Sim' },
]

function CraftTimeRing({ seconds }) {
  const maxSeconds = 300
  const progress = Math.min((seconds || 0) / maxSeconds, 1)
  const circumference = 2 * Math.PI * 40
  const offset = circumference * (1 - progress)

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          stroke="rgba(34, 211, 238, 0.6)"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{ filter: 'drop-shadow(0 0 4px rgba(34, 211, 238, 0.4))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Clock className="w-4 h-4 text-sc-accent mb-1" />
        <span
          className="text-lg font-bold text-white"
          style={{ textShadow: '0 0 12px rgba(34, 211, 238, 0.4)' }}
        >
          {formatTime(seconds)}
        </span>
      </div>
    </div>
  )
}

function BestLocations({ slots, resourceLocations }) {
  const overlap = useMemo(() => {
    if (!resourceLocations || !slots || slots.length === 0) return []
    const resourceNames = [...new Set(slots.map(s => s.resource_name))]
    if (resourceNames.length < 2) return [] // no overlap to find with 1 resource

    // Build location → set of resources available there
    const locationResources = new Map() // location name → Set<resource>
    for (const resName of resourceNames) {
      const locs = resourceLocations[resName] || []
      for (const loc of locs) {
        const key = loc.location
        if (!locationResources.has(key)) locationResources.set(key, { system: loc.system, resources: new Set() })
        locationResources.get(key).resources.add(resName)
      }
    }

    // Find locations that have ALL resources (or as many as possible)
    const results = []
    for (const [locName, data] of locationResources) {
      if (data.resources.size >= 2) {
        results.push({
          location: locName,
          system: data.system,
          matchCount: data.resources.size,
          totalNeeded: resourceNames.length,
          resources: [...data.resources],
        })
      }
    }

    return results.sort((a, b) => b.matchCount - a.matchCount || a.location.localeCompare(b.location))
  }, [slots, resourceLocations])

  if (overlap.length === 0) return null

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-4">
      <h4 className="text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
        <MapPin className="w-3.5 h-3.5" />
        Best Mining Locations
        <span className="text-[10px] text-gray-600 normal-case tracking-normal">
          — locations with multiple required materials
        </span>
      </h4>
      <div className="space-y-1">
        {overlap.slice(0, 10).map((loc, i) => (
          <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300">{humanizeLocationName(loc.location)}</span>
              <span className="text-[10px] text-gray-600">{loc.system}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                loc.matchCount === loc.totalNeeded
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {loc.matchCount}/{loc.totalNeeded} materials
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BlueprintDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, error, refetch } = useCrafting()

  const activeTab = searchParams.get('tab') || 'materials'
  const setTab = (tab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (tab === 'materials') next.delete('tab')
      else next.set('tab', tab)
      return next
    })
  }

  const blueprint = useMemo(() => {
    if (!data?.blueprints) return null
    return data.blueprints.find(b => String(b.id) === id)
  }, [data, id])


  if (loading) return <LoadingState fullScreen message="Loading blueprint..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!blueprint) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <FlaskConical className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Blueprint Not Found</h2>
        <p className="text-sm text-gray-500 mb-6">The blueprint you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/crafting')}
          className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors"
        >
          &larr; Back to Blueprints
        </button>
      </div>
    )
  }

  const typeColor = TYPE_COLORS[blueprint.type] || { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/crafting')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sc-accent transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Blueprints
      </button>

      {/* Header */}
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 mb-8 overflow-hidden">
        {/* HUD corners */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-sc-accent/20 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-sc-accent/20 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-sc-accent/20 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-sc-accent/20 rounded-br-2xl" />

        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            {/* Badges */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${typeColor.bg} ${typeColor.text} border ${typeColor.border}`}>
                {TYPE_LABELS[blueprint.type] || blueprint.type}
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
                {SUBTYPE_LABELS[blueprint.sub_type] || blueprint.sub_type}
              </span>
            </div>

            {/* Name */}
            <h1
              className="text-2xl font-bold text-white tracking-wide mb-2"
              style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.15)' }}
            >
              {blueprint.base_stats?.item_name || blueprint.name}
            </h1>

            {/* Slot count */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                {blueprint.slots?.length || 0} material {blueprint.slots?.length === 1 ? 'slot' : 'slots'}
              </span>
            </div>
            {/* Base weapon stats */}
            {blueprint.base_stats && (
              <div className="flex flex-wrap gap-3 mt-3">
                {blueprint.base_stats.rounds_per_minute && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400">
                    <Zap className="w-3 h-3 text-amber-400" />
                    {blueprint.base_stats.rounds_per_minute} RPM
                  </span>
                )}
                {blueprint.base_stats.damage && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400">
                    <Crosshair className="w-3 h-3 text-red-400" />
                    {blueprint.base_stats.damage} dmg
                  </span>
                )}
                {blueprint.base_stats.dps && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400">
                    <Target className="w-3 h-3 text-sc-accent" />
                    {blueprint.base_stats.dps} DPS
                  </span>
                )}
                {blueprint.base_stats.ammo_capacity && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400">
                    {blueprint.base_stats.ammo_capacity} rounds
                  </span>
                )}
              </div>
            )}
          </div>

          <CraftTimeRing seconds={blueprint.craft_time_seconds} />
        </div>

        {/* Acquisition sources — shows mission data when available, fallback message otherwise */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">How to Obtain</h4>
          {blueprint.acquisition && blueprint.acquisition.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {blueprint.acquisition.map((src, i) => (
                <Link
                  key={i}
                  to={`/missions/${src.generator_key}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-sc-accent hover:border-sc-accent/20 transition-colors"
                >
                  <FileText className="w-3 h-3 text-amber-400" />
                  <span>{src.display_name || src.generator_key}</span>
                  {src.mission_type && (
                    <>
                      <span className="text-gray-600">—</span>
                      <span className="text-gray-500">{src.mission_type}</span>
                    </>
                  )}
                </Link>
              ))}
            </div>
          ) : blueprint.is_default ? (
            <p className="text-xs text-emerald-400/80 italic">
              Known by default — available to craft from the start, no blueprint needed.
            </p>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-amber-500/5 border border-amber-500/15 text-amber-400/90">
              <Lock className="w-3 h-3" />
              <span>Exists in-game, but not yet obtainable — Star Citizen defines no source for this blueprint yet.</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.06] pb-px">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 relative ${
              activeTab === tab.key
                ? 'text-sc-accent'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sc-accent rounded-full shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'materials' && (
        <div className="space-y-3">
          {blueprint.slots?.length > 0 ? (
            <>
              {blueprint.slots.map((slot, i) => (
                <SlotCard key={i} slot={slot} index={i} resourceLocations={data?.resource_locations} />
              ))}
              <BestLocations slots={blueprint.slots} resourceLocations={data?.resource_locations} />
            </>
          ) : (
            <p className="text-center py-8 text-gray-500">No material slots.</p>
          )}
        </div>
      )}

      {activeTab === 'quality' && (
        <QualitySim
          blueprint={blueprint}
          initialBuildId={searchParams.get('build') ? parseInt(searchParams.get('build'), 10) : null}
        />
      )}
    </div>
  )
}
