import React, { useState, useMemo } from 'react'
import { Gem, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import {
  resourceColor, resourceBgColor, resourceBorderColor,
  formatQuantity, quantityUnits, isItemSlot,
  humanizeLocationName, qualityBandProbabilities, QUALITY_BANDS, ROCK_TIER_INFO,
} from './craftingUtils'

function QuantityBadge({ quantity }) {
  const units = quantityUnits(quantity)
  return (
    <span className="relative group/qty">
      <span className="text-xs text-gray-400 font-mono cursor-help border-b border-dashed border-gray-700">
        {formatQuantity(quantity)}
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/qty:flex flex-col items-end gap-0.5 px-3 py-2 rounded-lg bg-gray-900/95 border border-white/[0.08] shadow-xl shadow-black/40 backdrop-blur-sm z-10 whitespace-nowrap">
        {units.map(({ value, unit }) => (
          <span key={unit} className="flex items-center gap-2 text-xs">
            <span className="text-gray-200 font-mono font-medium">{value}</span>
            <span className="text-gray-500">{unit}</span>
          </span>
        ))}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900/95 border-b border-r border-white/[0.08] rotate-45" />
      </span>
    </span>
  )
}

// Item slots need a number of one specific item, not a cargo volume.
function ItemCountBadge({ quantity }) {
  if (quantity == null) return <span className="text-xs text-gray-400 font-mono">—</span>
  return (
    <span className="text-xs text-gray-400 font-mono" title={`${quantity} ${quantity === 1 ? 'item' : 'items'}`}>
      ×{quantity}
    </span>
  )
}

function probCell(p) {
  if (p <= 0) return 'text-gray-700'
  if (p < 0.05) return 'text-gray-600'
  if (p < 0.15) return 'text-gray-400'
  if (p < 0.30) return 'text-emerald-500/70'
  if (p < 0.50) return 'text-emerald-400'
  return 'text-emerald-300 font-medium'
}

function QualityBandRow({ bands }) {
  if (!bands) return <span className="text-xs text-gray-600 italic">No quality data</span>
  return (
    <div className="flex gap-1">
      {bands.map((b, i) => (
        <div key={i} className="flex-1 text-center">
          <span className={`text-xs font-mono ${probCell(b.probability)}`}>
            {b.probability > 0 ? `${(b.probability * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// Sort indicator arrow
function SortArrow({ active, desc }) {
  if (!active) return null
  return desc
    ? <ChevronDown className="w-2.5 h-2.5 text-sc-accent inline" />
    : <ChevronUp className="w-2.5 h-2.5 text-sc-accent inline" />
}

function ResourceLocations({ locations }) {
  const [open, setOpen] = useState(false)
  // sortKey: 'location' | 'system' | 'tier' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4'
  const [sortKey, setSortKey] = useState('location')
  const [sortDesc, setSortDesc] = useState(false)

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc)
    } else {
      setSortKey(key)
      // Default to descending for quality bands (highest first), ascending for text
      setSortDesc(key.startsWith('q'))
    }
  }

  const tierOrder = { Ground: -1, Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 }

  // Pre-compute quality bands for sorting
  const locsWithBands = useMemo(() =>
    locations.map(loc => ({
      ...loc,
      _bands: qualityBandProbabilities(loc.quality),
    })),
    [locations]
  )

  // Sort all locations as a flat list (no grouping by system when sorting by quality)
  const sorted = useMemo(() => {
    const items = [...locsWithBands]
    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'location') {
        cmp = humanizeLocationName(a.location).localeCompare(humanizeLocationName(b.location))
      } else if (sortKey === 'system') {
        cmp = (a.system || '').localeCompare(b.system || '')
      } else if (sortKey === 'tier') {
        cmp = (tierOrder[a.rock_tier] ?? 5) - (tierOrder[b.rock_tier] ?? 5)
      } else if (sortKey.startsWith('q')) {
        const idx = parseInt(sortKey[1])
        const aProb = a._bands?.[idx]?.probability ?? 0
        const bProb = b._bands?.[idx]?.probability ?? 0
        cmp = aProb - bProb
      }
      return sortDesc ? -cmp : cmp
    })
    return items
  }, [locsWithBands, sortKey, sortDesc])

  const totalLocations = locations.length

  // Sortable column header
  const ColHeader = ({ label, sortId, className = '' }) => (
    <button
      onClick={() => toggleSort(sortId)}
      className={`text-[10px] uppercase tracking-wider font-medium transition-colors cursor-pointer text-left ${
        sortKey === sortId ? 'text-sc-accent' : 'text-gray-600 hover:text-gray-400'
      } ${className}`}
    >
      {label} <SortArrow active={sortKey === sortId} desc={sortDesc} />
    </button>
  )

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
      >
        <MapPin className="w-3 h-3" />
        <span>{totalLocations} mining {totalLocations === 1 ? 'location' : 'locations'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-1 animate-fade-in">
          {/* Sortable header row */}
          <div className="flex items-end gap-2 pl-2 pb-1 border-b border-white/[0.04]">
            <div className="w-40 shrink-0">
              <ColHeader label="Location" sortId="location" />
            </div>
            <div className="w-14 shrink-0">
              <ColHeader label="System" sortId="system" />
            </div>
            <div className="w-20 shrink-0">
              <ColHeader label="Tier" sortId="tier" />
            </div>
            <div className="flex-1 flex gap-1">
              {QUALITY_BANDS.map((b, i) => (
                <div key={i} className="flex-1 text-center">
                  <ColHeader label={b.label} sortId={`q${i}`} className="!text-center w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {sorted.map((loc, i) => {
              const tier = ROCK_TIER_INFO[loc.rock_tier] || ROCK_TIER_INFO.Common
              return (
                <div key={`${loc.location}-${loc.rock_tier}-${i}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.02]">
                  <div className="w-40 shrink-0 truncate text-xs text-gray-300" title={loc.location}>
                    {humanizeLocationName(loc.location)}
                  </div>
                  <div className="w-14 shrink-0 text-[10px] text-gray-500">
                    {loc.system}
                  </div>
                  <div className="w-20 shrink-0">
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${tier.bg} ${tier.color} ${tier.border} border`}>
                      {tier.label}
                    </span>
                  </div>
                  <div className="flex-1">
                    <QualityBandRow bands={loc._bands} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SlotCard({ slot, index = 0, resourceLocations }) {
  const locations = resourceLocations?.[slot.resource_name]

  return (
    <div
      className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.05] rounded-lg p-4 animate-stagger-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-gray-200">
            {slot.name || `Slot ${index + 1}`}
          </h4>
          {slot.min_quality > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              min Q{slot.min_quality}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
            style={{
              backgroundColor: resourceBgColor(slot.resource_name),
              borderColor: resourceBorderColor(slot.resource_name),
              color: resourceColor(slot.resource_name),
            }}
          >
            <Gem className="w-3 h-3" />
            {slot.resource_name}
          </span>
          {isItemSlot(slot)
            ? <ItemCountBadge quantity={slot.quantity} />
            : <QuantityBadge quantity={slot.quantity} />}
        </div>
      </div>
      {locations && locations.length > 0 && (
        <ResourceLocations locations={locations} />
      )}
    </div>
  )
}
