import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Check, X as XIcon, ChevronDown, Activity } from 'lucide-react'
import {
  SHIP_PRESETS, MOD_KEYS, MOD_LABELS, MOD_POSITIVE_IS_GOOD,
  computeEffectiveModifiers, formatModPct,
  friendlyElementName,
} from './miningUtils'
import { computeEffectiveRockStats } from './computeEffectiveRockStats'
import { resolveRockEntity, buildMedianBaseByCategory } from './resolveRockEntity'
import DepositPicker from './DepositPicker'

// Custom styled select replacing native <select>
function CustomSelect({ label, value, onChange, options, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      {label && <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-200 cursor-pointer ${
          open
            ? 'bg-white/[0.06] border border-sc-accent/40 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
            : 'bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15]'
        }`}
      >
        <span className={selected ? 'text-gray-200' : 'text-gray-500'}>{selected?.label || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-gray-800/95 backdrop-blur-md border border-white/[0.1] shadow-xl shadow-black/40 scrollbar-thin">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? 'bg-sc-accent/10 text-sc-accent'
                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {opt.label}
              {opt.subtitle && <span className="text-gray-500 ml-2">{opt.subtitle}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ShipButton({ preset, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-lg text-xs font-medium border transition-all duration-200 cursor-pointer ${
        active
          ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
          : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
      }`}
    >
      {preset.name}
    </button>
  )
}

// Stat card inspired by RockBreaker's stats dashboard
function StatCard({ label, value, subtitle, color = 'text-sc-accent', glow = false }) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p
        className={`text-xl font-bold font-mono ${color}`}
        style={glow ? { textShadow: `0 0 12px currentColor` } : undefined}
      >
        {value}
      </p>
      {subtitle && <p className="text-[10px] text-gray-600 mt-1 font-mono">{subtitle}</p>}
    </div>
  )
}

function ChargeBar({ windowStart, windowEnd, effectiveInstabilityDelta }) {
  const startPct = windowStart * 100
  const endPct = windowEnd * 100
  const catStart = 90

  const instabilityLabel = effectiveInstabilityDelta != null
    ? (effectiveInstabilityDelta >= 0 ? `+${effectiveInstabilityDelta.toFixed(3)}` : effectiveInstabilityDelta.toFixed(3))
    : '—'
  const instabilityColor = effectiveInstabilityDelta != null && effectiveInstabilityDelta > 0.2
    ? 'text-red-400'
    : effectiveInstabilityDelta != null && effectiveInstabilityDelta > 0.05
      ? 'text-amber-400'
      : 'text-emerald-400'

  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Charge Window</div>
      <div className="relative h-8 bg-white/[0.04] rounded-full overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, rgba(34,211,238,0.05), rgba(34,211,238,0.05) 89%, rgba(239,68,68,0.15) 90%)'
        }} />
        {/* Catastrophic zone */}
        <div className="absolute top-0 bottom-0 bg-red-500/20 border-l border-red-500/30"
          style={{ left: `${catStart}%`, right: 0 }}
        />
        {/* Optimal window */}
        <div
          className="absolute top-0 bottom-0 bg-emerald-500/30 border-l-2 border-r-2 border-emerald-400/60"
          style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0.5)}%` }}
        />
        {/* Labels */}
        <div className="absolute inset-0 flex items-center px-3 justify-between text-[10px] font-mono">
          <span className="text-gray-500">0%</span>
          <span className="text-emerald-400 font-semibold bg-black/30 px-2 py-0.5 rounded">
            {startPct.toFixed(0)}–{endPct.toFixed(0)}%
          </span>
          <span className="text-gray-500">100%</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-gray-500 font-mono">
          Window: {(endPct - startPct).toFixed(1)}% wide
        </span>
        <span className={`font-mono font-semibold ${instabilityColor}`}>
          Instability Δ: {instabilityLabel}
        </span>
      </div>
    </div>
  )
}

// Power bar inspired by RockBreaker — shows deficit/surplus
function PowerBar({ totalDps, effectiveResistance, canBreak }) {
  const maxVal = Math.max(totalDps, effectiveResistance, 1)
  const powerPct = (totalDps / maxVal) * 100
  const resistPct = (effectiveResistance / maxVal) * 100
  const diff = totalDps - effectiveResistance
  const diffPct = effectiveResistance > 0 ? ((diff / effectiveResistance) * 100) : 0

  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Power vs Resistance</div>
      <div className="relative h-6 bg-white/[0.04] rounded-full overflow-hidden">
        {/* Power bar */}
        <div
          className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-500 ${
            canBreak ? 'bg-emerald-500/60' : 'bg-red-500/60'
          }`}
          style={{ width: `${powerPct}%` }}
        />
        {/* Resistance marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/40"
          style={{ left: `${resistPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs font-mono">
        <span className="text-gray-400">
          Your Power: <span className="text-sc-accent">{totalDps.toFixed(1)}</span>
        </span>
        <span className={canBreak ? 'text-emerald-400' : 'text-red-400'}>
          {canBreak ? 'Surplus' : 'Deficit'}: {diffPct.toFixed(1)}%
        </span>
        <span className="text-gray-400">
          Required: <span className="text-amber-400">{effectiveResistance.toFixed(1)}</span>
        </span>
      </div>
    </div>
  )
}

/** Format a range as "min – max (avg)" or just "value" for single variants. */
function fmtRange(rangeObj, fmt = (v) => v.toFixed(2)) {
  if (!rangeObj) return '—'
  if (rangeObj.min === rangeObj.max) return fmt(rangeObj.min)
  return `${fmt(rangeObj.min)} – ${fmt(rangeObj.max)} (avg ${fmt(rangeObj.avg)})`
}

// Module-scope pure helpers — no implicit closure over component state
function buildElements(compositionUuid, compositions, elements) {
  const comp = compositions.find((c) => c.uuid === compositionUuid)
  if (!comp?.composition_json) return []
  let parsed = []
  try { parsed = JSON.parse(comp.composition_json) } catch { return [] }
  return parsed.map((el) => {
    const match = elements.find((e) => e.class_name?.toLowerCase() === el.element?.toLowerCase())
    return { ...el, stats: match || {} }
  })
}

export default function RockCalculator({ data }) {
  const [shipIndex, setShipIndex] = useState(0)
  const ship = SHIP_PRESETS[shipIndex]

  const [laserIds, setLaserIds] = useState({})
  const [moduleIds, setModuleIds] = useState({})
  const [gadget, setGadget] = useState(null)
  const [pick, setPick] = useState({ depositName: null, compositionUuid: null })

  const lasers = data?.lasers || []
  const modules = data?.modules || []
  const gadgets = data?.gadgets || []
  const compositions = data?.compositions || []
  const elements = data?.elements || []

  // Show every composition that has a deposit_name. Comps without a direct
  // mineable_rock_entities row (the CommonShipMineables_X shared templates)
  // still get math via resolveRockEntity's median fallback below — they're
  // exactly what a player scans in the wild, so they MUST be visible.
  const pickerCompositions = useMemo(
    () => (compositions ?? []).filter((c) => c.deposit_name),
    [compositions],
  )

  const medianBaseByCategory = useMemo(
    () => buildMedianBaseByCategory(data?.rock_entities ?? []),
    [data?.rock_entities],
  )

  const shipScopeParams = useMemo(
    () => (data?.global_params ?? []).find((p) => p.scope === 'ship') ?? null,
    [data?.global_params],
  )

  const result = useMemo(() => {
    let totalDps = 0
    let allMods = {}
    for (const key of MOD_KEYS) allMods[key] = 0

    for (let i = 0; i < ship.slots.length; i++) {
      const laser = laserIds[i]
      if (!laser) continue
      totalDps += laser.beam_dps || 0

      const slotModules = []
      for (let j = 0; j < (laser.module_slots || 0); j++) {
        const mod = moduleIds[`${i}-${j}`]
        if (mod) slotModules.push(mod)
      }

      const mods = computeEffectiveModifiers(laser, slotModules, i === 0 ? gadget : null)
      for (const key of MOD_KEYS) allMods[key] += mods[key]
    }

    return { totalDps, mods: allMods }
  }, [ship, laserIds, moduleIds, gadget])

  const aggregatedStats = useMemo(() => {
    if (!pick.depositName) return null

    const targets = pick.compositionUuid
      ? [pick.compositionUuid]
      : pickerCompositions.filter((c) => c.deposit_name === pick.depositName).map((c) => c.uuid)

    const perVariant = targets
      .map((uuid) => {
        const entity = resolveRockEntity(uuid, compositions, data?.rock_entities, medianBaseByCategory)
        const stats = computeEffectiveRockStats({
          rockEntity: entity,
          elements: buildElements(uuid, compositions, elements),
          globalParams: shipScopeParams,
          laserMods: result.mods,
        })
        if (!stats) return null
        return { ...stats, is_fallback: !!entity?.is_fallback }
      })
      .filter(Boolean)

    if (perVariant.length === 0) return null
    const anyFallback = perVariant.some((v) => v.is_fallback)
    if (perVariant.length === 1) return { single: perVariant[0], count: 1, is_fallback: anyFallback }

    const keys = [
      'effective_resistance',
      'effective_resistance_after_laser',
      'effective_instability_delta',
      'effective_window_midpoint_delta',
      'effective_window_thinness_delta',
    ]
    const agg = { range: {}, single: null, count: perVariant.length, is_fallback: anyFallback }
    for (const k of keys) {
      const vals = perVariant.map((s) => s[k]).filter((v) => v != null)
      if (vals.length === 0) continue
      agg.range[k] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      }
    }
    return agg
  }, [pick, pickerCompositions, compositions, elements, data?.rock_entities, shipScopeParams, medianBaseByCategory, result.mods])

  // Derive display values from aggregatedStats (single or range avg)
  const displayStats = useMemo(() => {
    if (!aggregatedStats) return null

    const get = (key) => {
      if (aggregatedStats.single) return aggregatedStats.single[key]
      return aggregatedStats.range?.[key]?.avg ?? null
    }

    const effectiveResistance = get('effective_resistance') ?? 0
    const effectiveResistanceAfterLaser = get('effective_resistance_after_laser') ?? effectiveResistance
    const instabilityDelta = get('effective_instability_delta') ?? 0
    const windowMidpointDelta = get('effective_window_midpoint_delta') ?? 0
    const windowThinnessDelta = get('effective_window_thinness_delta') ?? 0

    // Compute window from global params + deltas
    const globalWindowSize = shipScopeParams?.optimal_window_size ?? 0.1
    const baseMidpoint = 0.5 + windowMidpointDelta
    const baseThinness = Math.max(0.01, (1 / globalWindowSize) + windowThinnessDelta)
    const windowSize = (1 / baseThinness) * (1 + (result.mods.mod_optimal_window_size || 0))
    const windowStart = Math.max(0, baseMidpoint - windowSize / 2)
    const windowEnd = Math.min(1, baseMidpoint + windowSize / 2)

    const canBreak = result.totalDps > effectiveResistanceAfterLaser

    return {
      effectiveResistance,
      effectiveResistanceAfterLaser,
      instabilityDelta,
      windowStart,
      windowEnd,
      canBreak,
    }
  }, [aggregatedStats, result.mods, result.totalDps, shipScopeParams])

  // Elements list for single-variant display
  const displayElements = useMemo(() => {
    if (!pick.compositionUuid) return []
    return buildElements(pick.compositionUuid, compositions, elements)
  }, [pick.compositionUuid, compositions, elements])

  const hasLoadout = Object.values(laserIds).some(Boolean)
  const hasResults = pick.depositName && hasLoadout && displayStats

  const buildLaserOptions = (slotSize) => {
    const filtered = lasers.filter(l => l.size === slotSize)
    return [
      { value: '', label: 'None' },
      ...filtered.map(l => ({
        value: String(l.id),
        label: `${l.name} (S${l.size})`,
        subtitle: `${l.beam_dps?.toFixed(1)} DPS`,
      }))
    ]
  }

  const buildModuleOptions = () => {
    return [
      { value: '', label: 'None' },
      ...modules.map(m => ({
        value: String(m.id),
        label: m.name,
        subtitle: m.type,
      }))
    ]
  }

  const gadgetOptions = [
    { value: '', label: 'None' },
    ...gadgets.map(g => ({ value: String(g.id), label: g.name }))
  ]

  return (
    // pb-72 reserves room below the page so the Rock / Dominant-Element
    // dropdowns (max-h-60 ≈ 240px + padding) can fully open without being
    // clipped by the viewport when the user scrolls them into the bottom.
    <div className="space-y-6 pb-72">
      {/* Two-column layout: Setup | Results */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* LEFT: Setup — descending z-index so dropdowns overlay cards below */}
        <div className="space-y-5">
          {/* Ship selector */}
          <div className="relative z-40 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-display">Ship / Platform</h3>
            <div className="flex flex-wrap gap-2">
              {SHIP_PRESETS.map((preset, i) => (
                <ShipButton
                  key={preset.name}
                  preset={preset}
                  active={shipIndex === i}
                  onClick={() => {
                    setShipIndex(i)
                    setLaserIds({})
                    setModuleIds({})
                    setGadget(null)
                  }}
                />
              ))}
            </div>
          </div>

          {/* Laser + module selection */}
          {ship.slots.map((slot, i) => {
            const laser = laserIds[i]
            return (
              <div key={i} className="relative bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3" style={{ zIndex: 30 - i }}>
                <CustomSelect
                  label={slot.label}
                  value={laser ? String(laser.id) : ''}
                  onChange={val => {
                    const found = lasers.find(l => String(l.id) === val)
                    setLaserIds(prev => ({ ...prev, [i]: found || null }))
                  }}
                  options={buildLaserOptions(slot.size)}
                  placeholder="Select laser..."
                />
                {laser && laser.module_slots > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-4 border-l-2 border-sc-accent/20">
                    {Array.from({ length: laser.module_slots }, (_, j) => (
                      <CustomSelect
                        key={j}
                        label={`Module ${j + 1}`}
                        value={moduleIds[`${i}-${j}`] ? String(moduleIds[`${i}-${j}`].id) : ''}
                        onChange={val => {
                          const found = modules.find(m => String(m.id) === val)
                          setModuleIds(prev => ({ ...prev, [`${i}-${j}`]: found || null }))
                        }}
                        options={buildModuleOptions()}
                        placeholder="None"
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Gadget */}
          <div className="relative z-20 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <CustomSelect
              label="Gadget (consumable)"
              value={gadget ? String(gadget.id) : ''}
              onChange={val => {
                const found = gadgets.find(g => String(g.id) === val)
                setGadget(found || null)
              }}
              options={gadgetOptions}
              placeholder="None"
            />
          </div>

          {/* Rock selector */}
          <div className="relative z-10 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-display">Rock</h3>
            <DepositPicker compositions={pickerCompositions} value={pick} onChange={setPick} />
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="space-y-4">
          {hasResults ? (
            <>
              {/* CAN/CANNOT BREAK banner — prominent like RockBreaker */}
              <div className={`relative overflow-hidden rounded-xl border-2 p-6 text-center ${
                displayStats.canBreak
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-red-500/10 border-red-500/40'
              }`}>
                {/* HUD corners */}
                <div className={`absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 rounded-tl-xl ${displayStats.canBreak ? 'border-emerald-400/60' : 'border-red-400/60'}`} />
                <div className={`absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 rounded-tr-xl ${displayStats.canBreak ? 'border-emerald-400/60' : 'border-red-400/60'}`} />
                <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 rounded-bl-xl ${displayStats.canBreak ? 'border-emerald-400/60' : 'border-red-400/60'}`} />
                <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 rounded-br-xl ${displayStats.canBreak ? 'border-emerald-400/60' : 'border-red-400/60'}`} />

                {displayStats.canBreak ? (
                  <div>
                    <Check className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                    <p className="text-2xl font-bold tracking-wider text-emerald-400 font-display"
                      style={{ textShadow: '0 0 20px rgba(52, 211, 153, 0.5)' }}>
                      CAN BREAK
                    </p>
                  </div>
                ) : (
                  <div>
                    <XIcon className="w-10 h-10 mx-auto mb-2 text-red-400" />
                    <p className="text-2xl font-bold tracking-wider text-red-400 font-display"
                      style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.5)' }}>
                      CANNOT BREAK
                    </p>
                  </div>
                )}

                {aggregatedStats && aggregatedStats.count > 1 && (
                  <p className="text-[10px] text-gray-500 mt-2">
                    Showing average across {aggregatedStats.count} variants — pick a dominant element for exact values
                  </p>
                )}
                {aggregatedStats?.is_fallback && (
                  <p className="text-[10px] text-amber-400/80 mt-1">
                    ≈ Typical values — this deposit type has no per-rock data; using median of similar rocks
                  </p>
                )}
              </div>

              {/* Power vs Resistance bar */}
              <PowerBar
                totalDps={result.totalDps}
                effectiveResistance={displayStats.effectiveResistanceAfterLaser}
                canBreak={displayStats.canBreak}
              />

              {/* Stats dashboard — RockBreaker-inspired grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Total Laser Power"
                  value={result.totalDps.toFixed(2)}
                  color="text-sc-accent"
                  glow
                />
                <StatCard
                  label="Adjusted Resistance"
                  value={
                    aggregatedStats?.single
                      ? displayStats.effectiveResistanceAfterLaser.toFixed(2)
                      : fmtRange(aggregatedStats?.range?.effective_resistance_after_laser)
                  }
                  subtitle={
                    aggregatedStats?.single
                      ? `Base ${displayStats.effectiveResistance.toFixed(2)} × ${(1 - (result.mods.mod_resistance || 0)).toFixed(3)}`
                      : `${aggregatedStats?.count} variants`
                  }
                  color="text-amber-400"
                />
                <StatCard
                  label="Power Difference"
                  value={(result.totalDps - displayStats.effectiveResistanceAfterLaser).toFixed(2)}
                  color={displayStats.canBreak ? 'text-emerald-400' : 'text-red-400'}
                  glow
                />
                <StatCard
                  label="Instability Delta"
                  value={
                    aggregatedStats?.single
                      ? (displayStats.instabilityDelta >= 0
                          ? `+${displayStats.instabilityDelta.toFixed(3)}`
                          : displayStats.instabilityDelta.toFixed(3))
                      : fmtRange(aggregatedStats?.range?.effective_instability_delta, (v) => v.toFixed(3))
                  }
                  subtitle="Element modifier sum"
                  color={displayStats.instabilityDelta > 0.2 ? 'text-red-400' : displayStats.instabilityDelta > 0.05 ? 'text-amber-400' : 'text-emerald-400'}
                />
              </div>

              {/* Charge window */}
              <ChargeBar
                windowStart={displayStats.windowStart}
                windowEnd={displayStats.windowEnd}
                effectiveInstabilityDelta={displayStats.instabilityDelta}
              />

              {/* Rock elements — only shown for specific variant */}
              {pick.compositionUuid && displayElements.length > 0 && (
                <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
                  <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Rock Composition Elements</h4>
                  <div className="space-y-1.5">
                    {displayElements.map((el, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">
                          {friendlyElementName(el.element)}
                        </span>
                        <div className="flex items-center gap-3 text-gray-500 font-mono">
                          {el.max_pct != null && (
                            <span>{(el.min_pct ?? 0).toFixed(1)}–{el.max_pct.toFixed(1)}%</span>
                          )}
                          {el.stats?.element_resistance != null && (
                            <span className="text-amber-400/60">R:{el.stats.element_resistance.toFixed(3)}</span>
                          )}
                          {el.stats?.element_instability != null && (
                            <span className="text-red-400/60">I:{el.stats.element_instability.toFixed(3)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Effective modifiers */}
              {MOD_KEYS.some(k => Math.abs(result.mods[k]) > 0.0001) && (
                <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
                  <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Effective Modifiers</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {MOD_KEYS.map(key => {
                      const val = result.mods[key]
                      if (Math.abs(val) < 0.0001) return null
                      const isGood = val > 0 ? MOD_POSITIVE_IS_GOOD[key] : !MOD_POSITIVE_IS_GOOD[key]
                      return (
                        <div key={key} className="flex items-center justify-between text-xs px-2 py-1.5">
                          <span className="text-gray-500">{MOD_LABELS[key]}</span>
                          <span className={`font-mono font-semibold ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatModPct(val)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <Activity className="w-8 h-8 text-gray-600" />
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">Configure your loadout</p>
              <p className="text-xs text-gray-600 max-w-xs">
                Select a ship, equip a laser, and choose a rock to see fracture analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
