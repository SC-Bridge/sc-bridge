import React, { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Wrench } from 'lucide-react'
import { useMining } from '../../hooks/useAPI'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import RenderThumb from '../../components/RenderThumb'
import {
  EQUIPMENT_TYPE_COLORS, MOD_KEYS, MOD_LABELS, MOD_POSITIVE_IS_GOOD, formatModPct,
} from './miningUtils'

function ModifierBar({ modKey, value }) {
  if (value == null || Math.abs(value) < 0.0001) return null

  const label = MOD_LABELS[modKey]
  const isGood = value > 0 ? MOD_POSITIVE_IS_GOOD[modKey] : !MOD_POSITIVE_IS_GOOD[modKey]
  const pct = Math.min(Math.abs(value) * 100, 100)
  const barColor = isGood ? 'bg-emerald-500' : 'bg-red-500'
  const textColor = isGood ? 'text-emerald-400' : 'text-red-400'
  const isPositive = value > 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={`font-mono ${textColor}`}>{formatModPct(value)}</span>
      </div>
      <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden">
        {isPositive ? (
          <div className={`absolute left-1/2 h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${pct / 2}%` }} />
        ) : (
          <div className={`absolute right-1/2 h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${pct / 2}%` }} />
        )}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
      </div>
    </div>
  )
}

export default function EquipmentDetail() {
  const { id, type } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, refetch } = useMining()

  const equipType = type // 'laser', 'module', or 'gadget'

  const item = useMemo(() => {
    if (!data) return null
    const list = equipType === 'laser' ? data.lasers
      : equipType === 'module' ? data.modules
      : equipType === 'gadget' ? data.gadgets
      : []
    return (list || []).find(i => String(i.id) === id)
  }, [data, id, equipType])

  if (loading) return <LoadingState fullScreen message="Loading equipment..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!item) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Wrench className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Equipment Not Found</h2>
        <button onClick={() => navigate('/mining?tab=equipment')} className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors">
          &larr; Back to Mining
        </button>
      </div>
    )
  }

  const color = EQUIPMENT_TYPE_COLORS[equipType] || { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' }

  // Build stat rows based on equipment type
  const statRows = []
  if (equipType === 'laser') {
    if (item.beam_dps != null) statRows.push({ label: 'Beam DPS', value: item.beam_dps.toFixed(1) })
    if (item.beam_full_range != null) statRows.push({ label: 'Beam Range', value: `${item.beam_full_range.toFixed(0)}–${item.beam_zero_range?.toFixed(0) || '?'}m` })
    if (item.extract_dps != null) statRows.push({ label: 'Extract DPS', value: item.extract_dps.toFixed(1) })
    if (item.extract_full_range != null) statRows.push({ label: 'Extract Range', value: `${item.extract_full_range.toFixed(0)}–${item.extract_zero_range?.toFixed(0) || '?'}m` })
    if (item.module_slots != null) statRows.push({ label: 'Module Slots', value: item.module_slots })
    if (item.throttle_lerp_speed != null) statRows.push({ label: 'Throttle Speed', value: item.throttle_lerp_speed.toFixed(2) })
    if (item.throttle_minimum != null) statRows.push({ label: 'Throttle Min', value: (item.throttle_minimum * 100).toFixed(0) + '%' })
    if (item.vehicle_built_in) statRows.push({ label: 'Built-in To', value: item.vehicle_built_in })
  } else if (equipType === 'module') {
    if (item.type) statRows.push({ label: 'Type', value: item.type })
    if (item.charges != null) statRows.push({ label: 'Charges', value: item.charges })
    if (item.lifetime != null) statRows.push({ label: 'Lifetime', value: `${item.lifetime.toFixed(1)}s` })
    if (item.damage_multiplier != null && item.damage_multiplier !== 1) statRows.push({ label: 'Damage Mult', value: `×${item.damage_multiplier.toFixed(2)}` })
  }
  // Common
  if (item.size != null) statRows.push({ label: 'Size', value: `S${item.size}` })
  if (item.grade != null) statRows.push({ label: 'Grade', value: item.grade })
  if (item.manufacturer) statRows.push({ label: 'Manufacturer', value: item.manufacturer })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate('/mining?tab=equipment')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sc-accent transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Mining Guide
      </button>

      {/* Header */}
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 mb-8">
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-sc-accent/20 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-sc-accent/20 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-sc-accent/20 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-sc-accent/20 rounded-br-2xl" />

        {item.render && (
          <div className="mb-5 max-w-xl">
            <RenderThumb
              render={item.render}
              kind={item.render_variants_kind}
              itemKey={item.render_item_key}
              variant={item.render_variant}
              title={item.name}
              size={2048}
              className="rounded-xl"
            />
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${color.bg} ${color.text} border ${color.border}`}>
            {equipType}
          </span>
          {item.size != null && (
            <span className="px-2.5 py-1 rounded text-xs font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
              Size {item.size}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-white tracking-wide mb-2" style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.15)' }}>
          {item.name}
        </h1>
        {item.manufacturer && <p className="text-sm text-gray-500">{item.manufacturer}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="text-sm font-display uppercase tracking-wider text-gray-400 mb-4">Stats</h2>
          <div className="space-y-2">
            {statRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <span className="text-gray-500">{row.label}</span>
                <span className="text-gray-200 font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modifiers */}
        <div>
          <h2 className="text-sm font-display uppercase tracking-wider text-gray-400 mb-4">Modifiers</h2>
          <div className="space-y-3">
            {MOD_KEYS.map(key => (
              <ModifierBar key={key} modKey={key} value={item[key]} />
            ))}
            {MOD_KEYS.every(k => !item[k] || Math.abs(item[k]) < 0.0001) && (
              <p className="text-xs text-gray-600 italic">No modifiers</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
