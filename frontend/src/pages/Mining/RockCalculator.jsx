import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, X as XIcon, ChevronDown, Activity, Save, Trash2 } from 'lucide-react'
import {
  SHIP_PRESETS, MOD_KEYS, MOD_LABELS, MOD_POSITIVE_IS_GOOD,
  computeEffectiveModifiers, formatModPct,
  friendlyElementName, instabilityBand,
} from './miningUtils'
import { computeQualityBand } from './computeEffectiveRockStats'
import { resolveRockEntity, buildMedianBaseByCategory } from './resolveRockEntity'
import { computeCrackFeasibility } from './computeCrackFeasibility'
import MassSlider from './MassSlider'
import { encodeLoadoutParams, decodeLoadoutParams } from './loadoutCodec'
import {
  serializeLoadout, resolveLoadout, upsertLoadout, removeLoadout,
  readLocalLoadouts, writeLocalLoadouts,
} from './loadoutStore'
import { useSession } from '../../lib/auth-client'
import { usePreferences, setPreferences } from '../../hooks/useAPI'
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
          {options.map((opt, i) => (
            opt.header ? (
              <div
                key={`hdr-${i}`}
                className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500 border-t border-white/[0.04] first:border-t-0"
              >
                {opt.label}
              </div>
            ) : (
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
            )
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

function ChargeBar({ windowStart, windowEnd }) {
  const startPct = windowStart * 100
  const endPct = windowEnd * 100
  const widthPct = endPct - startPct
  const catStart = 90

  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">Optimal Charge Zone — release here</div>
        <div className="text-sm font-mono font-semibold text-emerald-400">{startPct.toFixed(0)}–{endPct.toFixed(0)}%</div>
      </div>
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
          style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
        />
        <div className="absolute inset-0 flex items-center px-3 justify-between text-[10px] font-mono">
          <span className="text-gray-500">0%</span>
          <span className="text-gray-500">100%</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
        Hold the beam between <span className="text-gray-300">{startPct.toFixed(0)}%</span> and <span className="text-gray-300">{endPct.toFixed(0)}%</span> charge
        {widthPct < 8 ? ' — a narrow window, easy to overshoot.' : ', then ease off — past the red zone is a catastrophic shatter.'}
      </p>
    </div>
  )
}

// Player-facing stability readout: named band + dot + risk phrase + 0–1000
// gauge, with the raw weighted instability and quality spread as a footnote.
function StabilityCard({ band, leanInstability, richInstability }) {
  const showSpread = leanInstability != null && richInstability != null
    && Math.abs(leanInstability - richInstability) > 1e-6
  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${band.dot}`} />
          <span className={`text-lg font-bold ${band.text}`}>{band.label}</span>
        </div>
        <span className={`text-sm font-mono ${band.text}`}>{band.risk}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] mt-3 overflow-hidden">
        <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${band.barPct}%` }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-2.5 leading-relaxed">
        {band.label === 'Stable'   && 'Forgiving — little danger of a catastrophic shatter.'}
        {band.label === 'Twitchy'  && 'Stay attentive — overcharging will shatter it.'}
        {band.label === 'Volatile' && 'Dangerous — overcharge even slightly and it shatters.'}
        {band.label === 'Extreme'  && 'Brutal — the shatter window is unforgiving.'}
        {' '}Higher-quality (richer) rolls of this rock get more unstable.
      </p>
      <p className="text-[10px] text-gray-600 mt-1.5 font-mono">
        instability {Math.round(band.value)} / 1000
        {showSpread && <> · lean {Math.round(leanInstability)} → rich {Math.round(richInstability)}</>}
      </p>
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
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Power vs Rock</div>
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
          Your power <span className="text-sc-accent">{totalDps.toFixed(0)}</span>
        </span>
        <span className={canBreak ? 'text-emerald-400' : 'text-red-400'}>
          {canBreak ? 'Surplus' : 'Deficit'} {diffPct.toFixed(0)}%
        </span>
        <span className="text-gray-400">
          Needs <span className="text-amber-400">{effectiveResistance.toFixed(0)}</span>
        </span>
      </div>
    </div>
  )
}

/** "Lean X → Rich Y" sub-line for a quality band. Collapses to a single
 *  value when lean and rich coincide (e.g. a single fixed-% element). */
function fmtBandSpread(band, fmt = (v) => v.toFixed(2)) {
  if (!band || band.lean == null || band.rich == null) return null
  if (Math.abs(band.lean - band.rich) < 1e-6) return null
  return `Lean ${fmt(band.lean)} → Rich ${fmt(band.rich)}`
}

/** Plain-language difficulty tag for a composition element, from its signed
 *  resistance modifier + raw instability. Lets a player read "easy" / "brutal"
 *  instead of "R:-0.400 I:50.000". */
function elementDifficultyTag(stats) {
  const r = stats?.element_resistance
  const i = stats?.element_instability
  if (r == null && i == null) return null
  if ((r ?? 0) >= 0.6 || (i ?? 0) >= 700) return { label: 'brutal', tone: 'text-red-400' }
  if ((r ?? 0) >= 0.3 || (i ?? 0) >= 400) return { label: 'tough', tone: 'text-orange-400' }
  if ((r ?? 0) <= -0.3 && (i ?? 0) < 100) return { label: 'easy', tone: 'text-emerald-400' }
  return { label: 'moderate', tone: 'text-gray-400' }
}

// Module-scope pure helpers — no implicit closure over component state
//
// computeEffectiveRockStats reads element stats under `element_`-prefixed keys
// (element_resistance, element_instability, …) but the mineable_elements rows
// from /api/gamedata/mining carry UNPREFIXED columns (resistance, instability,
// …). Map them here — without this the join "succeeds" but every stat reads
// undefined → 0, so resistance/instability deltas are silently inert for every
// rock (quantainium looks identical to iron).
export function elementStats(row) {
  if (!row) return {}
  return {
    element_resistance: row.resistance,
    element_instability: row.instability,
    element_optimal_window_midpoint: row.optimal_window_midpoint,
    element_optimal_window_thinness: row.optimal_window_thinness,
    element_explosion_multiplier: row.explosion_multiplier,
  }
}

export function buildElements(compositionUuid, compositions, elements) {
  const comp = compositions.find((c) => c.uuid === compositionUuid)
  if (!comp?.composition_json) return []
  let parsed = []
  try { parsed = JSON.parse(comp.composition_json) } catch { return [] }
  return parsed.map((el) => {
    const match = elements.find((e) => e.class_name?.toLowerCase() === el.element?.toLowerCase())
    return { ...el, stats: elementStats(match) }
  })
}

// Per-equipment-scope Rock Mass slider config. `mining_global_params.scope`
// values are 'ship' | 'fps' | 'ground_vehicle' (see migration
// 0251_mining_global_params.sql). Only 'ship' is wired into RockCalculator
// today — see the `massScope` comment below — but the fps/ground_vehicle
// rows are kept ready so threading the real equipment scope through later is
// a config lookup, not a rewrite.
const MASS_SCOPE_CONFIG = {
  ship: { min: 0, max: 40000, default: 8000, step: 100, unit: 'kg' },
  fps: { min: 0, max: 10, default: 1, step: 0.1, unit: 'kg' },
  ground_vehicle: { min: 0, max: 2000, default: 400, step: 10, unit: 'kg' },
}

// Format a best-case crack time (seconds, continuous) as a short duration.
// Sub-10s values keep one decimal — the difference between 0.4s and 4s
// matters at that scale, whole-second precision doesn't.
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !(seconds > 0)) return '--'
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// Mass-scaled fill/decay verdict — a separate axis from the resistance-based
// CAN/CANNOT BREAK banner below. That banner asks "does my DPS beat this
// rock's resistance"; this asks "can my DPS out-fill the mass-scaled decay
// drain fast enough to ever finish the pool" (computeCrackFeasibility).
// Styled like the page's other result cards (ChargeBar/StabilityCard/PowerBar).
//
// `feasibility` may be null (mass=0, or the scope's global params haven't
// loaded) — only the OUTPUT row is gated on that. The slider itself always
// renders: it's the only control that can set mass back to something
// feasibility-computable, so hiding it alongside the row would strand the
// player at mass=0 with no way back short of a page reload.
function MassCrackCard({ mass, massConfig, onMassChange, feasibility }) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4 space-y-3">
      <MassSlider
        value={mass}
        min={massConfig.min}
        max={massConfig.max}
        step={massConfig.step}
        defaultValue={massConfig.default}
        label="Rock Mass"
        unit={massConfig.unit}
        onChange={onMassChange}
      />
      {feasibility && (
        <div className="flex items-center justify-between text-xs font-mono">
          <span className={`font-semibold ${feasibility.canCrack ? 'text-emerald-400' : 'text-red-400'}`}>
            {feasibility.canCrack ? 'CAN CRACK' : 'CANNOT CRACK'}
          </span>
          {feasibility.canCrack && (
            <span className="text-gray-400">~{formatDuration(feasibility.timeToCrack)} best case</span>
          )}
          <span className={feasibility.marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {feasibility.marginPct > 0 ? '+' : ''}{feasibility.marginPct.toFixed(0)}% power margin
          </span>
        </div>
      )}
    </div>
  )
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

  // ── Deep-link: hydrate state from the URL once data is available, then keep
  //    the URL in sync as the loadout/rock changes (shareable scenario). We
  //    only touch our own keys so the parent's `tab` param is preserved.
  const [searchParams, setSearchParams] = useSearchParams()
  // `hydrated` is state (not a ref) so the URL-writer below only runs on the
  // render AFTER hydration — the hydrated values are applied in the same batch
  // as setHydrated(true), so the writer never clobbers the incoming link with
  // default state first.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated || !data) return
    const decoded = decodeLoadoutParams(searchParams, data, SHIP_PRESETS.length)
    if (decoded) {
      setShipIndex(decoded.shipIndex)
      setLaserIds(decoded.laserIds)
      setModuleIds(decoded.moduleIds)
      setGadget(decoded.gadget)
      setPick(decoded.pick)
    }
    setHydrated(true)
  }, [data, searchParams, hydrated])

  useEffect(() => {
    if (!hydrated) return
    const next = encodeLoadoutParams({ shipIndex, laserIds, moduleIds, gadget, pick })
    setSearchParams((prev) => {
      const merged = new URLSearchParams(prev)
      // Drop our keys, then re-add the current set (so removals clear from URL).
      for (const k of [...merged.keys()]) {
        if (k === 'ship' || k === 'gadget' || k === 'rock' || k === 'el'
            || /^l\d+$/.test(k) || /^m\d+-\d+$/.test(k)) merged.delete(k)
      }
      for (const [k, v] of Object.entries(next)) merged.set(k, v)
      return merged
    }, { replace: true })
  }, [hydrated, shipIndex, laserIds, moduleIds, gadget, pick, setSearchParams])

  // ── Saved loadouts: account-backed when logged in, localStorage otherwise.
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const { data: prefs } = usePreferences({ skip: !isLoggedIn })
  const [loadouts, setLoadouts] = useState([])
  const [loadoutName, setLoadoutName] = useState('')

  // Load saved loadouts from the right source once we know auth state.
  useEffect(() => {
    if (isLoggedIn) {
      if (prefs === null) return // still loading
      try {
        const arr = prefs?.miningLoadouts ? JSON.parse(prefs.miningLoadouts) : []
        setLoadouts(Array.isArray(arr) ? arr : [])
      } catch { setLoadouts([]) }
    } else {
      setLoadouts(readLocalLoadouts())
    }
  }, [isLoggedIn, prefs])

  const persistLoadouts = useCallback((next) => {
    setLoadouts(next)
    if (isLoggedIn) {
      setPreferences({ miningLoadouts: next.length ? JSON.stringify(next) : null })
        .catch((err) => console.error('[mining] save loadouts failed:', err))
    } else {
      writeLocalLoadouts(next)
    }
  }, [isLoggedIn])

  const saveCurrentLoadout = useCallback(() => {
    const name = loadoutName.trim()
    if (!name) return
    persistLoadouts(upsertLoadout(loadouts, serializeLoadout(name, { shipIndex, laserIds, moduleIds, gadget })))
    setLoadoutName('')
  }, [loadoutName, loadouts, shipIndex, laserIds, moduleIds, gadget, persistLoadouts])

  const applyLoadout = useCallback((entry) => {
    const r = resolveLoadout(entry, data)
    setShipIndex(r.shipIndex)
    setLaserIds(r.laserIds)
    setModuleIds(r.moduleIds)
    setGadget(r.gadget)
  }, [data])

  const deleteLoadout = useCallback((name) => {
    persistLoadouts(removeLoadout(loadouts, name))
  }, [loadouts, persistLoadouts])

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

  // Rock Mass slider (crack feasibility). RockCalculator doesn't yet thread a
  // real per-equipment scope through to its math — `shipScopeParams` above
  // resolves 'ship' unconditionally, even when the ROC or FPS Multi-Tool
  // SHIP_PRESETS entry is active — so mass stays on 'ship' too for now.
  // Swapping to the real scope later is changing this one constant.
  const massScope = 'ship'
  const massConfig = MASS_SCOPE_CONFIG[massScope]
  const [mass, setMass] = useState(massConfig.default)

  const massScopeParams = useMemo(
    () => (data?.global_params ?? []).find((p) => p.scope === massScope) ?? null,
    [data?.global_params, massScope],
  )

  const result = useMemo(() => {
    let totalDps = 0
    let allMods = {}
    for (const key of MOD_KEYS) allMods[key] = 0

    for (let i = 0; i < ship.slots.length; i++) {
      const laser = laserIds[i]
      if (!laser) continue

      const slotModules = []
      for (let j = 0; j < (laser.module_slots || 0); j++) {
        const mod = moduleIds[`${i}-${j}`]
        if (mod) slotModules.push(mod)
      }

      // Module damage multipliers stack multiplicatively on the host laser
      // (Rieger MK3 ×1.25, Surge ×1.5, Focus MK1 ×0.85, ArgoGEO ×0.15).
      // `?? 1` so a legitimate 0 multiplier isn't silently neutralised.
      const damageMult = slotModules.reduce((p, m) => p * (m.damage_multiplier ?? 1), 1)
      totalDps += (laser.beam_dps || 0) * damageMult

      const mods = computeEffectiveModifiers(laser, slotModules, i === 0 ? gadget : null)
      for (const key of MOD_KEYS) allMods[key] += mods[key]
    }

    return { totalDps, mods: allMods }
  }, [ship, laserIds, moduleIds, gadget])

  const crackFeasibility = useMemo(
    () => computeCrackFeasibility({ mass, globalParams: massScopeParams, effectiveDPS: result.totalDps }),
    [mass, massScopeParams, result.totalDps],
  )

  // Per-stat quality band. For each target composition we sample the quality
  // roll (lean/avg/rich); across variants (generic deposit mode) we average
  // each quality point. `band[key] = { lean, avg, rich }`. The `avg` point is
  // the expected rock and drives the can-break / charge math; lean→rich shows
  // how difficulty (esp. instability) climbs with quality.
  const BAND_KEYS = [
    'effective_resistance',
    'effective_resistance_after_laser',
    'effective_instability_delta',
    'effective_window_midpoint_delta',
    'effective_window_thinness_delta',
  ]
  const aggregatedStats = useMemo(() => {
    if (!pick.depositName) return null

    const targets = pick.compositionUuid
      ? [pick.compositionUuid]
      : pickerCompositions.filter((c) => c.deposit_name === pick.depositName).map((c) => c.uuid)

    const perVariant = targets
      .map((uuid) => {
        const entity = resolveRockEntity(uuid, compositions, data?.rock_entities, medianBaseByCategory)
        const qb = computeQualityBand({
          rockEntity: entity,
          elements: buildElements(uuid, compositions, elements),
          globalParams: shipScopeParams,
          laserMods: result.mods,
        })
        if (!qb) return null
        return { ...qb, is_fallback: !!entity?.is_fallback }
      })
      .filter(Boolean)

    if (perVariant.length === 0) return null
    const anyFallback = perVariant.some((v) => v.is_fallback)

    // band[key] = { lean, avg, rich } averaged across variants at each quality point
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
    const band = {}
    for (const k of BAND_KEYS) {
      band[k] = {
        lean: mean(perVariant.map((v) => v.lean?.[k] ?? v.avg[k])),
        avg: mean(perVariant.map((v) => v.avg[k])),
        rich: mean(perVariant.map((v) => v.rich?.[k] ?? v.avg[k])),
      }
    }
    return { band, count: perVariant.length, is_fallback: anyFallback }
  }, [pick, pickerCompositions, compositions, elements, data?.rock_entities, shipScopeParams, medianBaseByCategory, result.mods])

  // Derive display values from the band's avg (expected) quality point.
  const displayStats = useMemo(() => {
    if (!aggregatedStats) return null

    const get = (key) => aggregatedStats.band?.[key]?.avg ?? null

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
    // Margin: how much your power over/under-shoots the rock's resistance.
    const marginPct = effectiveResistanceAfterLaser > 0
      ? Math.abs((result.totalDps - effectiveResistanceAfterLaser) / effectiveResistanceAfterLaser) * 100
      : 0

    const band = instabilityBand(instabilityDelta)
    const leanInstability = aggregatedStats.band?.effective_instability_delta?.lean
    const richInstability = aggregatedStats.band?.effective_instability_delta?.rich

    return {
      effectiveResistance,
      effectiveResistanceAfterLaser,
      instabilityDelta,
      windowStart,
      windowEnd,
      canBreak,
      marginPct,
      band,
      leanInstability,
      richInstability,
    }
  }, [aggregatedStats, result.mods, result.totalDps, shipScopeParams])

  // Elements list for single-variant display. A composition can list the same
  // element as multiple parts (e.g. CommonShipMineables_Iron has two iron_ore
  // bands with different quality_scale) — merge them per element for display
  // (min of mins, max of maxes) so the player sees "Iron Ore" once. The math
  // (aggregatedStats) still uses the raw per-part breakdown.
  const displayElements = useMemo(() => {
    if (!pick.compositionUuid) return []
    const raw = buildElements(pick.compositionUuid, compositions, elements)
    const merged = new Map()
    for (const el of raw) {
      const key = el.element
      const prev = merged.get(key)
      if (!prev) {
        merged.set(key, { ...el })
      } else {
        prev.min_pct = Math.min(prev.min_pct ?? 0, el.min_pct ?? 0)
        prev.max_pct = Math.max(prev.max_pct ?? 0, el.max_pct ?? 0)
      }
    }
    return [...merged.values()]
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

  // Modules excluded from ship-context picker — these are vehicle-only mining
  // attachments (ATLS exosuit and ROC ground vehicle) per CIG's
  // RequiredPortTags=ATLSModifier/ROCdsModifier on their host entities. They
  // share `miningConsumable` with ship modules so they leak into ship pickers
  // unless explicitly filtered. See reference_cig_item_port_compatibility memory.
  const VEHICLE_ONLY_MODULE_NAMES = new Set(['ATLS GEO Module', 'ROC Module'])

  const buildModuleOptions = () => {
    const eligible = modules.filter(m => !VEHICLE_ONLY_MODULE_NAMES.has(m.name))
    const actives = eligible.filter(m => m.type === 'active')
    const passives = eligible.filter(m => m.type === 'passive')
    const other = eligible.filter(m => m.type !== 'active' && m.type !== 'passive')

    const toOption = (m) => ({
      value: String(m.id),
      label: m.name,
      // Surface charges/lifetime in subtitle for actives so players can see
      // how many uses they get without opening detail.
      subtitle:
        m.type === 'active' && m.charges != null && m.lifetime != null
          ? `${m.charges}× / ${m.lifetime}s`
          : undefined,
    })

    const opts = [{ value: '', label: 'None' }]
    if (actives.length) {
      opts.push({ header: true, label: 'Active' }, ...actives.map(toOption))
    }
    if (passives.length) {
      opts.push({ header: true, label: 'Passive' }, ...passives.map(toOption))
    }
    if (other.length) {
      opts.push({ header: true, label: 'Other' }, ...other.map(toOption))
    }
    return opts
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

          {/* Saved loadouts — save the current ship config, reload it later.
              Backed by your account when logged in, otherwise this browser. */}
          <div className="relative z-0 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-display">Saved Loadouts</h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={loadoutName}
                onChange={(e) => setLoadoutName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentLoadout() }}
                placeholder="Name this loadout…"
                maxLength={40}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-white/[0.03] border border-white/[0.08] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-sc-accent/40"
              />
              <button
                type="button"
                onClick={saveCurrentLoadout}
                disabled={!loadoutName.trim() || !Object.values(laserIds).some(Boolean)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-sc-accent/15 text-sc-accent border border-sc-accent/30 hover:bg-sc-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>

            {loadouts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-600">
                  {isLoggedIn ? 'Saved to your account' : 'Saved in this browser'}
                </p>
                {loadouts.map((lo) => (
                  <div key={lo.name} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyLoadout(lo)}
                      className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer truncate"
                    >
                      {lo.name}
                      <span className="text-gray-600 ml-2">{SHIP_PRESETS[lo.ship]?.name ?? 'Ship'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLoadout(lo.name)}
                      aria-label={`Delete ${lo.name}`}
                      className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="space-y-4">
          {hasResults ? (
            <>
              {/* Rock Mass — mass-scaled fill/decay crack feasibility. Always
                  rendered once a loadout+rock are picked, even when
                  `crackFeasibility` is null (mass=0, or no scope params) —
                  see MassCrackCard's null-feasibility handling above. */}
              <MassCrackCard
                mass={mass}
                massConfig={massConfig}
                onMassChange={setMass}
                feasibility={crackFeasibility}
              />

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
                    <p className="text-xs text-gray-300 mt-1.5">
                      Your laser overpowers this rock by{' '}
                      <span className="text-emerald-400 font-semibold">{displayStats.marginPct.toFixed(0)}%</span>
                      {displayStats.marginPct < 15 && <span className="text-amber-400"> — tight</span>}
                    </p>
                  </div>
                ) : (
                  <div>
                    <XIcon className="w-10 h-10 mx-auto mb-2 text-red-400" />
                    <p className="text-2xl font-bold tracking-wider text-red-400 font-display"
                      style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.5)' }}>
                      CANNOT BREAK
                    </p>
                    <p className="text-xs text-gray-300 mt-1.5">
                      Short by <span className="text-red-400 font-semibold">{displayStats.marginPct.toFixed(0)}%</span> — needs a stronger laser or modules
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

              {/* Power vs Rock bar (your power vs power-to-fracture) */}
              <div>
                <PowerBar
                  totalDps={result.totalDps}
                  effectiveResistance={displayStats.effectiveResistanceAfterLaser}
                  canBreak={displayStats.canBreak}
                />
                {fmtBandSpread(aggregatedStats?.band?.effective_resistance_after_laser, (v) => v.toFixed(0)) && (
                  <p className="text-[10px] text-gray-600 mt-1.5 ml-1 font-mono">
                    power needed by quality — {fmtBandSpread(aggregatedStats?.band?.effective_resistance_after_laser, (v) => v.toFixed(0))}
                  </p>
                )}
              </div>

              {/* Stability — the danger axis, as a named band */}
              <StabilityCard
                band={displayStats.band}
                leanInstability={displayStats.leanInstability}
                richInstability={displayStats.richInstability}
              />

              {/* Optimal charge zone */}
              <ChargeBar
                windowStart={displayStats.windowStart}
                windowEnd={displayStats.windowEnd}
              />

              {/* What's in it — only shown for a specific variant */}
              {pick.compositionUuid && displayElements.length > 0 && (
                <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg p-4">
                  <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">What's in it</h4>
                  <div className="space-y-1.5">
                    {displayElements.map((el, i) => {
                      const tag = elementDifficultyTag(el.stats)
                      return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300">{friendlyElementName(el.element)}</span>
                          <div className="flex items-center gap-3 font-mono text-gray-500">
                            {el.max_pct != null && (
                              <span>{(el.min_pct ?? 0).toFixed(0)}–{el.max_pct.toFixed(0)}%</span>
                            )}
                            {tag && <span className={tag.tone}>{tag.label}</span>}
                            {/* raw modifiers kept for power users */}
                            {el.stats?.element_resistance != null && (
                              <span className="text-gray-600">R:{el.stats.element_resistance.toFixed(2)}</span>
                            )}
                            {el.stats?.element_instability != null && (
                              <span className="text-gray-600">I:{el.stats.element_instability.toFixed(0)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Your loadout bonuses — collapsed; power-user detail */}
              {MOD_KEYS.some(k => Math.abs(result.mods[k]) > 0.0001) && (
                <details className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg px-4 py-3 group">
                  <summary className="text-[10px] uppercase tracking-wider text-gray-500 cursor-pointer select-none flex items-center gap-2 list-none">
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    Your laser &amp; module bonuses
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-3">
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
                </details>
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
