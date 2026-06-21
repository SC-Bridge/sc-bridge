import React, { useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, X, Wrench,
  Rocket, Zap, Box, Package, Palette, LayoutGrid, List,
  Tag, DollarSign, Calendar, PenLine, ArrowUpRight, CircleDot,
} from 'lucide-react'
import { useShip, useShipLoadout, useShipPaints, useShipSalvage, useWeaponRacks, useSuitLockers, useFleet, useFleetEntryUpgrades, useShipModules, useOwnedModules, useOwnedPaints } from '../hooks/useAPI'
import ModulesSection from './Loadout/ModulesSection'
import StorageBreakdown from './Ships/StorageBreakdown'
import { useSession } from '../lib/auth-client'
import ShipImage from '../components/ShipImage'
import StatusBadge from '../components/StatusBadge'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import {
  PowerPlantIcon, CoolerIcon, ShieldGeneratorIcon, QuantumDriveIcon,
  RadarIcon, JumpDriveIcon, WeaponIcon, TurretIcon, MissileRackIcon,
  ElectromagneticIcon, MiningLaserIcon, CrossSectionIcon, UtilityIcon, QEDIcon,
} from '../assets/icons/index.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'components', label: 'Components' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'interior', label: 'Interior' },
  { id: 'performance', label: 'Performance' },
  { id: 'paints', label: 'Paints' },
  { id: 'salvage', label: 'Salvage' },
]

const COMPONENT_TYPES = new Set(['power', 'cooler', 'shield', 'quantum_drive', 'sensor', 'jump_drive'])
const WEAPON_TYPES = new Set(['weapon', 'turret', 'missile', 'countermeasure', 'mining_laser', 'salvage_head', 'salvage_module', 'qed'])

// ─── Component stat formatters ──────────────────────────────────────────────

function formatPower(watts) {
  if (watts >= 1000) return `${(watts / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW`
  return `${watts.toLocaleString(undefined, { maximumFractionDigits: 1 })} W`
}

function formatSpeed(cmPerSec) {
  const kmPerSec = cmPerSec / 100000
  if (kmPerSec >= 1000) return `${(kmPerSec / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} Mm/s`
  return `${kmPerSec.toLocaleString(undefined, { maximumFractionDigits: 1 })} km/s`
}

function formatSeconds(ms) {
  return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}s`
}

function formatHP(val) {
  return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** Returns an array of { label, value } for the given component, based on port_type */
function getComponentStats(item) {
  const stats = []
  const add = (label, raw, fmt) => {
    if (raw != null && raw !== 0) stats.push({ label, value: fmt ? fmt(raw) : String(raw) })
  }

  switch (item.port_type) {
    case 'power':
      add('Output', item.power_output, formatPower)
      break
    case 'shield':
      add('HP', item.shield_hp, formatHP)
      add('Regen', item.shield_regen, (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}/s`)
      break
    case 'cooler':
      add('Cooling', item.cooling_rate, (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}/s`)
      break
    case 'quantum_drive':
      add('Speed', item.quantum_speed, formatSpeed)
      add('Spool', item.spool_time, formatSeconds)
      add('Cooldown', item.cooldown_time, formatSeconds)
      break
    default:
      break
  }
  return stats
}

const PORT_TYPE_ICON = {
  power:          PowerPlantIcon,
  cooler:         CoolerIcon,
  shield:         ShieldGeneratorIcon,
  quantum_drive:  QuantumDriveIcon,
  sensor:         RadarIcon,
  jump_drive:     JumpDriveIcon,
  weapon:         WeaponIcon,
  turret:         TurretIcon,
  missile:        MissileRackIcon,
  countermeasure: ElectromagneticIcon,
  mining_laser:   MiningLaserIcon,
  salvage_head:   CrossSectionIcon,
  salvage_module: UtilityIcon,
  qed:            QEDIcon,
}

// ─── Component detail slideout ────────────────────────────────────────────────

/** Stat definitions per port_type. Each entry: [key, label, formatter?] */
const formatMass = (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`
const formatInt = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })
const formatCompact = (v) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
  if (v >= 100_000) return `${(v / 1_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K`
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

const DETAIL_STATS = {
  power: [
    ['power_output', 'Power Output', formatPower],
    ['overheat_temperature', 'Overheat Temp'],
    ['base_heat_generation', 'Heat Generation'],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
    ['distortion_max', 'Distortion Max', formatInt],
  ],
  shield: [
    ['shield_hp', 'Shield HP', formatHP],
    ['shield_regen', 'Regen Rate', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}/s`],
    ['regen_delay', 'Regen Delay', formatSeconds],
    ['downed_regen_delay', 'Downed Regen Delay', formatSeconds],
    ['resist_physical', 'Physical Resist', formatPercent],
    ['resist_energy', 'Energy Resist', formatPercent],
    ['resist_distortion', 'Distortion Resist', formatPercent],
    ['resist_thermal', 'Thermal Resist', formatPercent],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
  ],
  cooler: [
    ['cooling_rate', 'Cooling Rate', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}/s`],
    ['overheat_temperature', 'Overheat Temp'],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
    ['distortion_max', 'Distortion Max', formatInt],
  ],
  quantum_drive: [
    ['quantum_speed', 'Speed', formatSpeed],
    ['quantum_range', 'Range', (v) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`],
    ['fuel_rate', 'Fuel Rate'],
    ['spool_time', 'Spool Time', formatSeconds],
    ['cooldown_time', 'Cooldown', formatSeconds],
    ['stage1_accel', 'Stage 1 Accel', formatCompact],
    ['stage2_accel', 'Stage 2 Accel', formatCompact],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
  ],
  weapon: [
    ['dps', 'DPS', (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })],
    ['damage_per_shot', 'Damage / Shot', (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })],
    ['damage_type', 'Damage Type'],
    ['rounds_per_minute', 'Fire Rate', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} RPM`],
    ['effective_range', 'Effective Range', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`],
    ['ammo_container_size', 'Ammo Capacity'],
    ['projectile_speed', 'Projectile Speed', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m/s`],
    ['fire_modes', 'Fire Modes'],
    ['heat_per_shot', 'Heat / Shot'],
    ['power_draw', 'Power Draw', formatPower],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
  ],
  turret: [
    ['rotation_speed', 'Rotation Speed', (v) => `${v}°/s`],
    ['min_pitch', 'Min Pitch', (v) => `${v}°`],
    ['max_pitch', 'Max Pitch', (v) => `${v}°`],
    ['min_yaw', 'Min Yaw', (v) => `${v}°`],
    ['max_yaw', 'Max Yaw', (v) => `${v}°`],
    ['gimbal_type', 'Gimbal Type'],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
  ],
  missile: [
    ['damage', 'Damage', formatInt],
    ['blast_radius', 'Blast Radius'],
    ['tracking_signal', 'Tracking'],
    ['lock_time', 'Lock Time'],
    ['speed', 'Speed', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m/s`],
    ['lock_range', 'Lock Range', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
  ],
  sensor: [
    ['radar_range', 'Radar Range', (v) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`],
    ['power_draw', 'Power Draw', formatPower],
    ['hp', 'HP', formatInt],
    ['mass', 'Mass', formatMass],
    ['em_signature', 'EM Signature', formatInt],
  ],
  mining_laser: [
    ['dps', 'DPS', (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })],
    ['power_draw', 'Power Draw', formatPower],
    ['effective_range', 'Range', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`],
  ],
  qed: [
    ['qed_range', 'QED Range', (v) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`],
    ['qed_strength', 'QED Strength'],
  ],
}

const COMMON_STATS = [
  ['power_output', 'Power Output', formatPower],
  ['hp', 'HP', formatInt],
  ['mass', 'Mass', formatMass],
  ['em_signature', 'EM Signature', formatInt],
  ['thrust_force', 'Thrust', (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} N`],
  ['fuel_burn_rate', 'Fuel Burn Rate'],
]

function formatPercent(v) {
  return `${(v * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function ComponentDetailPanel({ item, onClose }) {
  if (!item) return null

  const TypeIcon = PORT_TYPE_ICON[item.port_type]
  const sz = item.component_size ?? (item.size_max > 0 ? item.size_max : null)

  // Gather stats for this port_type
  const statDefs = DETAIL_STATS[item.port_type] || COMMON_STATS
  const stats = []
  const shownKeys = new Set()

  for (const [key, label, fmt] of statDefs) {
    const val = item[key]
    if (val != null && val !== 0 && val !== '') {
      const display = fmt ? fmt(val) : String(val)
      stats.push({ label, value: display })
      shownKeys.add(key)
    }
  }

  // Add common stats not already shown
  if (item.port_type && DETAIL_STATS[item.port_type]) {
    for (const [key, label, fmt] of COMMON_STATS) {
      if (shownKeys.has(key)) continue
      const val = item[key]
      if (val != null && val !== 0 && val !== '') {
        stats.push({ label, value: fmt ? fmt(val) : String(val) })
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-sc-bg border-l border-sc-border z-50 overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-sc-bg/95 backdrop-blur border-b border-sc-border z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              {TypeIcon && <TypeIcon className="w-5 h-5 shrink-0 text-sc-accent" />}
              <div className="min-w-0">
                <h3 className="text-sm font-display font-semibold text-white truncate">
                  {item.component_name || 'Empty Port'}
                </h3>
                <p className="text-xs text-gray-500">{item.category_label}</p>
              </div>
            </div>
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Identity badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {sz != null && (
              <span className="text-xs font-mono px-2 py-1 rounded border border-sc-accent/40 text-sc-accent bg-sc-accent/5">
                Size {sz}
              </span>
            )}
            {item.grade && (
              <span className="text-xs font-mono px-2 py-1 rounded bg-sc-accent2/10 text-sc-accent2">
                Grade {item.grade}
              </span>
            )}
            {item.component_class && (
              <span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-400">
                {item.component_class}
              </span>
            )}
            {item.port_type && (
              <span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-500">
                {item.port_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {item.manufacturer_name && (
            <div className="text-xs text-sc-accent2 font-mono">{item.manufacturer_name}</div>
          )}

          {/* Stats */}
          {stats.length > 0 ? (
            <div className="panel">
              <div className="panel-header">Stats</div>
              <div className="p-4 space-y-0">
                {stats.map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-sc-border/30 last:border-0">
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{s.label}</span>
                    <span className="text-sm font-mono text-white">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="panel p-6 text-center text-gray-500 text-xs font-mono">
              No detailed stats available
            </div>
          )}

          {/* Port info */}
          <div className="panel">
            <div className="panel-header">Port Info</div>
            <div className="p-4 space-y-0">
              {item.port_name && (
                <div className="flex items-center justify-between py-1.5 border-b border-sc-border/30 last:border-0">
                  <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Port Name</span>
                  <span className="text-sm font-mono text-white">{item.port_name}</span>
                </div>
              )}
              {item.size_min != null && item.size_max != null && (
                <div className="flex items-center justify-between py-1.5 border-b border-sc-border/30 last:border-0">
                  <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Size Range</span>
                  <span className="text-sm font-mono text-white">
                    {item.size_min === item.size_max ? `S${item.size_min}` : `S${item.size_min} – S${item.size_max}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────


function SpecRow({ label, value }) {
  if (value == null || value === '' || value === 0) return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-sc-border/30 last:border-0">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono text-white">{value}</span>
    </div>
  )
}

// Shared right column (pricing, status, acquisition) — used by both overview variants
function OverviewRightCol({ ship }) {
  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">Pricing</div>
        <div className="p-4 space-y-2">
          {ship.pledge_price > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Pledge Store</span>
              <span className="text-sm font-mono text-sc-warn">${ship.pledge_price} USD</span>
            </div>
          )}
          {ship.price_auec > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">In-Game</span>
              <span className="text-sm font-mono text-sc-melt">{ship.price_auec.toLocaleString()} aUEC</span>
            </div>
          )}
          {(ship.acquisition_type === 'ingame_quest' || ship.acquisition_type === 'ingame_cz') && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Source</span>
              <span className="text-sm text-sc-accent2">Quest Reward</span>
            </div>
          )}
          {!ship.pledge_price && !ship.price_auec &&
            ship.acquisition_type !== 'ingame_quest' && ship.acquisition_type !== 'ingame_cz' && (
            <p className="text-xs text-gray-600 font-mono">No pricing data</p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Status</div>
        <div className="p-4">
          <StatusBadge status={ship.production_status} />
        </div>
      </div>

      {ship.acquisition_type && (
        <div className="panel">
          <div className="panel-header">Acquisition</div>
          <div className="p-4 space-y-1">
            <div className="text-sm font-mono text-gray-300 capitalize">
              {ship.acquisition_type.replace(/_/g, ' ')}
            </div>
            {ship.acquisition_source_name && (
              <div className="text-xs text-sc-accent2">{ship.acquisition_source_name}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CCU History ──────────────────────────────────────────────────────────────

function CCUHistory({ fleetEntryId }) {
  const { data, loading } = useFleetEntryUpgrades(fleetEntryId)

  if (loading || !data?.pledge || !data?.upgrades?.length) return null

  const { pledge, upgrades } = data
  const formatDate = (parsed, raw) => {
    if (parsed) {
      const d = new Date(parsed)
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
    if (raw) return raw
    return ''
  }

  const formatValue = (cents, raw) => {
    if (cents) return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    if (raw) return raw
    return ''
  }

  return (
    <div className="panel border-l-4 border-l-sc-accent2">
      <div className="panel-header flex items-center gap-2">
        <ArrowUpRight className="w-3.5 h-3.5 text-sc-accent2" />
        Upgrade History
      </div>
      <div className="p-4">
        <div className="relative pl-6 space-y-0">
          {/* Vertical line */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-sc-border/60" />

          {/* Base pledge */}
          <div className="relative pb-5">
            <div className="absolute left-[-16px] top-1.5 w-2.5 h-2.5 rounded-full bg-sc-accent2 ring-2 ring-sc-accent2/30" />
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-sm font-mono text-white font-semibold">{pledge.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Base pledge</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-mono font-semibold text-sc-success">{formatValue(pledge.value_cents, pledge.value)}</span>
                {pledge.pledge_date_parsed && (
                  <p className="text-xs text-gray-600 mt-0.5">{formatDate(pledge.pledge_date_parsed, pledge.pledge_date)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Upgrades */}
          {upgrades.map((upg, i) => {
            const isLast = i === upgrades.length - 1
            return (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className={`absolute left-[-16px] top-1.5 w-2.5 h-2.5 rounded-full ${isLast ? 'bg-sc-accent ring-2 ring-sc-accent/30' : 'bg-gray-500 ring-2 ring-gray-500/20'}`} />
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className={`text-sm font-mono ${isLast ? 'text-white font-semibold' : 'text-gray-300'}`}>{upg.upgrade_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {upg.new_value_cents && (
                      <span className="text-sm font-mono font-semibold text-sc-success">{formatValue(upg.new_value_cents, upg.new_value)}</span>
                    )}
                    {upg.applied_at_parsed && (
                      <p className="text-xs text-gray-600 mt-0.5">{formatDate(upg.applied_at_parsed, upg.applied_at)}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PledgeSection({ ship }) {
  const { data: fleet } = useFleet()

  // Find fleet entries for this ship
  const entries = (fleet || []).filter(v => v.vehicle_slug === ship.slug)

  if (entries.length === 0) return null

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="space-y-3">
          <div className="panel border-l-4 border-l-sc-accent">
            <div className="panel-header">Your Pledge</div>
            <div className="p-4 space-y-3">
              {entry.pledge_name && (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Tag className="w-3 h-3 text-gray-500" />
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Pledge</span>
                  </div>
                  <p className="text-sm font-semibold text-sc-accent pl-[18px]">{entry.pledge_name}</p>
                </div>
              )}
              {entry.current_value_cents > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3 text-gray-500" />
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Current Value</span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-sc-success">
                    ${(entry.current_value_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {entry.pledge_date && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Date</span>
                  </div>
                  <span className="text-sm font-mono text-white">{entry.pledge_date}</span>
                </div>
              )}
              {entry.custom_name && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <PenLine className="w-3 h-3 text-gray-500" />
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Ship Name</span>
                  </div>
                  <span className="text-sm font-mono text-sc-accent2">{entry.custom_name}</span>
                </div>
              )}
            </div>
          </div>
          <CCUHistory fleetEntryId={entry.id} />
        </div>
      ))}
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ ship, isAuthed }) {
  const crewValue = ship.crew_min != null && ship.crew_max != null
    ? ship.crew_min === ship.crew_max ? String(ship.crew_min) : `${ship.crew_min} – ${ship.crew_max}`
    : null

  const pyr = (ship.angular_velocity_pitch != null || ship.angular_velocity_yaw != null || ship.angular_velocity_roll != null)
    ? `${ship.angular_velocity_pitch ?? '—'} / ${ship.angular_velocity_yaw ?? '—'} / ${ship.angular_velocity_roll ?? '—'} °/s`
    : null

  const dims = (ship.length || ship.beam || ship.height)
    ? `${ship.length ?? '?'} × ${ship.beam ?? '?'} × ${ship.height ?? '?'} m`
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="panel">
          <div className="panel-header">Ship Data</div>
          <div className="p-4 space-y-0">
            {/* Identity */}
            <SpecRow label="Role" value={ship.focus} />
            <SpecRow label="Classification" value={ship.classification} />
            <SpecRow label="Size" value={ship.size_label} />
            <SpecRow label="Crew" value={crewValue} />
            {/* Speed */}
            <SpecRow label="SCM Speed" value={ship.speed_scm ? `${ship.speed_scm} m/s` : null} />
            <SpecRow label="SCM Boost Back" value={ship.boost_speed_back ? `${ship.boost_speed_back} m/s` : null} />
            <SpecRow label="Max Speed" value={ship.speed_max ? `${ship.speed_max} m/s` : null} />
            {/* Maneuvering */}
            <SpecRow label="Pitch / Yaw / Roll" value={pyr} />
            {/* Physical */}
            <SpecRow label="Dimensions (L × B × H)" value={dims} />
            <SpecRow label="Mass" value={ship.mass ? `${ship.mass.toLocaleString()} kg` : null} />
            <SpecRow label="Hull HP" value={ship.hull_hp ? ship.hull_hp.toLocaleString() : null} />
            {/* Propulsion */}
            <SpecRow label="H₂ Fuel" value={ship.fuel_capacity_hydrogen != null ? `${ship.fuel_capacity_hydrogen} SCU` : null} />
            <SpecRow label="QT Fuel" value={ship.fuel_capacity_quantum != null ? `${ship.fuel_capacity_quantum} SCU` : null} />
            <SpecRow label="Main Thrusters" value={ship.thruster_count_main != null ? String(ship.thruster_count_main) : null} />
            <SpecRow label="Maneuvering Thrusters" value={ship.thruster_count_maneuvering != null ? String(ship.thruster_count_maneuvering) : null} />
            {/* Signatures */}
            <SpecRow label="IR Signature" value={ship.ir_signature != null ? ship.ir_signature.toFixed(2) : null} />
            <SpecRow label="EM Signature" value={ship.em_signature != null ? ship.em_signature.toFixed(2) : null} />
            <SpecRow label="Cross-Section" value={ship.cross_section_x != null ? `${ship.cross_section_x} × ${ship.cross_section_y} × ${ship.cross_section_z} m` : null} />
            {/* Insurance */}
            <SpecRow label="Claim Time" value={ship.claim_time != null ? `${ship.claim_time} min` : null} />
            <SpecRow label="Expedited Claim" value={ship.expedited_claim_time != null ? `${ship.expedited_claim_time} min` : null} />
            <SpecRow label="Expedite Cost" value={ship.expedited_claim_cost != null ? `${ship.expedited_claim_cost.toLocaleString()} aUEC` : null} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Storage</div>
          <div className="p-4">
            <StorageBreakdown storage={ship.storage} summary={ship} />
          </div>
        </div>

        {ship.description && (
          <div className="panel">
            <div className="panel-header">Description</div>
            <p className="p-4 text-sm text-gray-400 leading-relaxed whitespace-pre-line">{ship.description.replace(/\\n/g, '\n')}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <OverviewRightCol ship={ship} />
        {isAuthed && <PledgeSection ship={ship} />}
      </div>
    </div>
  )
}

// ─── Loadout ──────────────────────────────────────────────────────────────────

function LoadoutItems({ items, emptyIcon: Icon, emptyMessage, onItemClick }) {
  // F106: capital ships expose 50+ hardpoints that game data doesn't populate.
  // Default to hiding empty ports per category; expose a toggle to reveal them.
  const [expandedCategories, setExpandedCategories] = useState(() => new Set())

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Icon className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  const turretPortIds = new Set(items.filter(i => i.port_type === 'turret').map(i => i.port_id))
  const turretChildIds = new Set(items.filter(i => turretPortIds.has(i.parent_port_id)).map(i => i.port_id))

  const grouped = items.reduce((acc, item) => {
    if (turretChildIds.has(item.port_id)) return acc
    const cat = item.category_label
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const turretWeapons = new Map()
  items.filter(i => turretChildIds.has(i.port_id)).forEach(item => {
    const pid = item.parent_port_id
    if (!turretWeapons.has(pid)) turretWeapons.set(pid, [])
    turretWeapons.get(pid).push(item)
  })

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, rows]) => {
        const TypeIcon = PORT_TYPE_ICON[rows[0]?.port_type]
        const filled = rows.filter(r => !!r.component_name)
        const empties = rows.filter(r => !r.component_name)
        const total = rows.length
        const showEmpties = expandedCategories.has(category)
        const displayRows = showEmpties ? rows : filled
        return (
        <div key={category} className="panel overflow-hidden">
          <div className="panel-header flex items-center gap-2">
            {TypeIcon && <TypeIcon className="w-4 h-4 shrink-0 opacity-70" />}
            {category}
            <span className="text-gray-600 font-normal ml-0.5">
              {filled.length < total ? `${filled.length} / ${total}` : `${total}`}
            </span>
            {empties.length > 0 && (
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="ml-auto text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
                aria-label={`${showEmpties ? 'Hide' : 'Show'} ${empties.length} empty ${category} hardpoints`}
              >
                {showEmpties ? `− hide ${empties.length} empty` : `+ show ${empties.length} empty`}
              </button>
            )}
          </div>
          {displayRows.length > 0 && (
            <div className="divide-y divide-sc-border/20">
              {displayRows.map((item, i) => {
                const sz = item.component_size ?? (item.size_max > 0 ? item.size_max : null)
                const weapons = item.port_type === 'turret' ? (turretWeapons.get(item.port_id) || []) : []
                const isEmpty = !item.component_name
                return (
                  <div key={i}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3 ${isEmpty ? 'opacity-40' : 'cursor-pointer hover:bg-white/[0.03] transition-colors'}`}
                      onClick={() => !isEmpty && onItemClick?.(item)}
                    >
                      <div className="shrink-0 w-10 h-10 rounded flex items-center justify-center font-mono font-bold text-sm border border-sc-accent/40 text-sc-accent bg-sc-accent/5">
                        {sz != null ? `S${sz}` : '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-mono ${isEmpty ? 'text-gray-500 italic' : 'text-white'}`}>
                          {item.component_name || 'Empty'}
                        </p>
                        {!isEmpty && (item.grade || item.component_class) && (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {item.grade && (
                              <span className="text-xs font-mono text-sc-accent2 bg-sc-accent2/10 px-1.5 py-px rounded">
                                Grade {item.grade}
                              </span>
                            )}
                            {item.component_class && (
                              <span className="text-xs text-gray-500">{item.component_class}</span>
                            )}
                          </div>
                        )}
                        {!isEmpty && (() => {
                          const stats = getComponentStats(item)
                          if (stats.length === 0) return null
                          return (
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {stats.map((s) => (
                                <span key={s.label} className="text-xs font-mono text-gray-400">
                                  <span className="text-gray-600">{s.label}</span>{' '}{s.value}
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="shrink-0 text-xs text-gray-500 text-right max-w-[160px]">
                        {item.manufacturer_name || ''}
                      </div>
                    </div>
                    {weapons.map((w, wi) => {
                      const wsz = w.component_size ?? (w.size_max > 0 ? w.size_max : null)
                      return (
                        <div
                          key={wi}
                          className="flex items-center gap-3 pl-10 pr-4 py-2.5 bg-black/20 border-t border-sc-border/10 cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => onItemClick?.(w)}
                        >
                          <div className="shrink-0 w-8 h-8 rounded flex items-center justify-center font-mono font-bold text-xs border border-sc-accent/30 text-sc-accent/70 bg-sc-accent/5">
                            {wsz != null ? `S${wsz}` : '—'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-white/80">{w.component_name || '—'}</p>
                            {(w.grade || w.component_class) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {w.grade && (
                                  <span className="text-xs font-mono text-sc-accent2/80 bg-sc-accent2/10 px-1 py-px rounded">
                                    Grade {w.grade}
                                  </span>
                                )}
                                {w.component_class && (
                                  <span className="text-xs text-gray-600">{w.component_class}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-xs text-gray-600 text-right max-w-[160px]">
                            {w.manufacturer_name || ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )})}
    </div>
  )
}

// ─── Component / Weapon tabs ──────────────────────────────────────────────────

function ComponentsTab({ slug }) {
  const navigate = useNavigate()
  const { data: loadout, loading, error, refetch } = useShipLoadout(slug)
  const { data: modules } = useShipModules(slug)
  const { data: ownedModules } = useOwnedModules(slug)
  const [selected, setSelected] = useState(null)
  if (loading) return <LoadingState message="Loading components..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  const items = (loadout || []).filter(r => COMPONENT_TYPES.has(r.port_type))
  return (
    <>
      {(items.length > 0 || modules?.length > 0) && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => navigate(`/loadout/${slug}`)}
            className="px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white rounded transition-colors flex items-center gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5" />
            Customize Loadout
          </button>
        </div>
      )}
      <LoadoutItems items={items} emptyIcon={Box} emptyMessage="No component data available" onItemClick={setSelected} />
      {modules?.length > 0 && (
        <div className="mt-4">
          <ModulesSection modules={modules} ownedTitles={ownedModules} />
        </div>
      )}
      <ComponentDetailPanel item={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function WeaponsTab({ slug }) {
  const { data: loadout, loading, error, refetch } = useShipLoadout(slug)
  const [selected, setSelected] = useState(null)
  if (loading) return <LoadingState message="Loading weapons..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  const items = (loadout || []).filter(r => WEAPON_TYPES.has(r.port_type))
  return (
    <>
      <LoadoutItems items={items} emptyIcon={Rocket} emptyMessage="No weapon hardpoints" onItemClick={setSelected} />
      <ComponentDetailPanel item={selected} onClose={() => setSelected(null)} />
    </>
  )
}

// ─── Paints tab ───────────────────────────────────────────────────────────────

function PaintsTab({ slug, isAuthed }) {
  const { data: paints, loading, error, refetch } = useShipPaints(slug)
  const { ownedSet } = useOwnedPaints()
  const [view, setView] = useState('list')

  if (loading) return <LoadingState message="Loading paints..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  if (!paints || paints.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Palette className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No paints available</p>
      </div>
    )
  }

  const ownedCount = isAuthed ? paints.filter(p => ownedSet.has(p.id)).length : 0

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span>
          Paints <span className="text-gray-500 font-normal">({paints.length})</span>
          {isAuthed && (
            <span className="ml-2 text-xs font-normal text-emerald-400">
              {ownedCount} owned
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView('list')}
            className={`p-1 rounded transition-colors ${view === 'list' ? 'text-sc-accent' : 'text-gray-500 hover:text-gray-300'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-1 rounded transition-colors ${view === 'grid' ? 'text-sc-accent' : 'text-gray-500 hover:text-gray-300'}`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="divide-y divide-sc-border/30">
          {paints.map((paint) => {
            const thumb = paint.image_url_small || paint.image_url_medium || paint.image_url
            const owned = isAuthed && ownedSet.has(paint.id)
            return (
              <div key={paint.id} className="flex items-center gap-4 px-4 py-3">
                <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-sc-surface border border-sc-border/40 flex items-center justify-center">
                  {thumb
                    ? <img src={thumb} alt={paint.name} className={`w-full h-full object-cover ${isAuthed && !owned ? 'opacity-50' : ''}`} />
                    : <Palette className="w-5 h-5 text-gray-600" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-gray-200">{paint.name}</p>
                    {isAuthed && (
                      owned ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-display uppercase tracking-wide bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                          Owned
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-display uppercase tracking-wide bg-white/5 text-gray-500 border border-white/10">
                          Not collected
                        </span>
                      )
                    )}
                  </div>
                  {paint.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{paint.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {paints.map((paint) => {
            const thumb = paint.image_url_small || paint.image_url_medium || paint.image_url
            const owned = isAuthed && ownedSet.has(paint.id)
            return (
              <div
                key={paint.id}
                className={`bg-sc-surface border rounded overflow-hidden ${owned ? 'border-emerald-500/40' : 'border-sc-border/40'}`}
              >
                <div className="aspect-square flex items-center justify-center bg-sc-bg relative">
                  {thumb
                    ? <img src={thumb} alt={paint.name} className={`w-full h-full object-cover ${isAuthed && !owned ? 'opacity-50' : ''}`} />
                    : <Palette className="w-8 h-8 text-gray-600" />
                  }
                  {owned && (
                    <span className="absolute top-1 right-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-display uppercase tracking-wide bg-emerald-500/80 text-white">
                      Owned
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-mono text-gray-300 truncate" title={paint.name}>{paint.name}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Interior ────────────────────────────────────────────────────────────────

function InteriorTab({ ship }) {
  const { data: allRacks, loading: racksLoading } = useWeaponRacks()
  const { data: allLockers, loading: lockersLoading } = useSuitLockers()

  const loading = racksLoading || lockersLoading

  // Filter to this ship's data
  const racks = (allRacks || []).filter(r => r.vehicle_slug === ship.slug)
  const lockers = (allLockers || []).filter(l => l.vehicle_slug === ship.slug)

  if (loading) return <LoadingState message="Loading interior data..." />

  const hasCargoGrid = ship.cargo != null && ship.cargo > 0
  const hasPersonalStorage = ship.vehicle_inventory != null && ship.vehicle_inventory > 0
  const hasRacks = racks.length > 0
  const hasLockers = lockers.length > 0
  const hasAnyData = hasCargoGrid || hasPersonalStorage || hasRacks || hasLockers

  if (!hasAnyData) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Box className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No interior storage data available</p>
      </div>
    )
  }

  const personalSCU = hasPersonalStorage ? ship.vehicle_inventory / 1000000 : 0
  const totalRackSlots = racks.reduce((sum, r) => sum + (r.total_ports || 0), 0)
  const totalRifleSlots = racks.reduce((sum, r) => sum + (r.rifle_ports || 0), 0)
  const totalPistolSlots = racks.reduce((sum, r) => sum + (r.pistol_ports || 0), 0)

  return (
    <div className="space-y-4">
      {(hasCargoGrid || hasPersonalStorage) && (
        <div className="panel">
          <div className="panel-header">Storage</div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasCargoGrid && (
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sc-highlight/10 text-sc-highlight">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-mono font-semibold text-white">
                    {ship.cargo.toLocaleString()} <span className="text-sm text-gray-400">SCU</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Cargo grid</p>
                </div>
              </div>
            )}
            {hasPersonalStorage && (
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sc-accent2/10 text-sc-accent2">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-mono font-semibold text-white">
                    {personalSCU.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-sm text-gray-400">SCU</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Personal inventory</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {hasRacks && (
        <div className="panel">
          <div className="panel-header">Weapon Racks</div>
          <div className="p-4 space-y-0">
            <SpecRow label="Total Racks" value={String(racks.length)} />
            <SpecRow label="Total Weapon Slots" value={String(totalRackSlots)} />
            <SpecRow label="Rifle Slots (Sz 2-4)" value={totalRifleSlots > 0 ? String(totalRifleSlots) : null} />
            <SpecRow label="Pistol Slots (Sz 0-1)" value={totalPistolSlots > 0 ? String(totalPistolSlots) : null} />
          </div>
          <div className="border-t border-sc-border/30">
            <div className="divide-y divide-sc-border/20">
              {racks.map((rack) => (
                <div key={rack.id} className="px-4 py-3">
                  <p className="text-sm font-mono text-gray-200">{rack.rack_label}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-gray-500">{rack.total_ports} slots</span>
                    {rack.rifle_ports > 0 && <span className="text-xs text-gray-500">{rack.rifle_ports} rifle</span>}
                    {rack.pistol_ports > 0 && <span className="text-xs text-gray-500">{rack.pistol_ports} pistol</span>}
                    <span className="text-xs text-gray-600">Sz {rack.min_size}–{rack.max_size}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasLockers && (
        <div className="panel">
          <div className="panel-header">Suit Lockers</div>
          <div className="p-4 space-y-0">
            <SpecRow label="Total Lockers" value={String(lockers.length)} />
          </div>
          <div className="border-t border-sc-border/30">
            <div className="divide-y divide-sc-border/20">
              {lockers.map((locker) => (
                <div key={locker.id} className="px-4 py-3">
                  <p className="text-sm font-mono text-gray-200">{locker.locker_label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Performance ──────────────────────────────────────────────────────────────

function PerformanceTab({ ship }) {
  const hasSpeed = ship.speed_scm || ship.speed_max || ship.boost_speed_back
  const hasManeuvering = ship.angular_velocity_pitch != null || ship.angular_velocity_yaw != null || ship.angular_velocity_roll != null
  const hasPropulsion = ship.fuel_capacity_hydrogen || ship.fuel_capacity_quantum || ship.thruster_count_main || ship.thruster_count_maneuvering
  const hasSignatures = ship.ir_signature != null || ship.em_signature != null || ship.cross_section_x != null
  const hasClaim = ship.claim_time != null

  if (!hasSpeed && !hasManeuvering && !hasPropulsion && !hasSignatures && !hasClaim) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Zap className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No performance data available</p>
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">Performance</div>
      <div className="divide-y divide-sc-border/40">
        {hasSpeed && (
          <div className="px-5 py-4 space-y-0">
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Speed</p>
            <SpecRow label="SCM Speed" value={ship.speed_scm ? `${ship.speed_scm} m/s` : null} />
            <SpecRow label="SCM Boost Back" value={ship.boost_speed_back ? `${ship.boost_speed_back} m/s` : null} />
            <SpecRow label="Max Speed" value={ship.speed_max ? `${ship.speed_max} m/s` : null} />
          </div>
        )}

        {hasManeuvering && (
          <div className="px-5 py-4">
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Maneuvering</p>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Pitch / Yaw / Roll</span>
              <span className="text-sm font-mono text-white">
                {ship.angular_velocity_pitch ?? '—'}
                <span className="text-gray-600 mx-1">/</span>
                {ship.angular_velocity_yaw ?? '—'}
                <span className="text-gray-600 mx-1">/</span>
                {ship.angular_velocity_roll ?? '—'}
                <span className="text-xs text-gray-500 ml-1.5">°/s</span>
              </span>
            </div>
          </div>
        )}

        {hasPropulsion && (
          <div className="px-5 py-4 space-y-0">
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Propulsion</p>
            <SpecRow label="H₂ Fuel" value={ship.fuel_capacity_hydrogen != null ? `${ship.fuel_capacity_hydrogen} SCU` : null} />
            <SpecRow label="QT Fuel" value={ship.fuel_capacity_quantum != null ? `${ship.fuel_capacity_quantum} SCU` : null} />
            <SpecRow label="Main Thrusters" value={ship.thruster_count_main != null ? String(ship.thruster_count_main) : null} />
            <SpecRow label="Maneuvering Thrusters" value={ship.thruster_count_maneuvering != null ? String(ship.thruster_count_maneuvering) : null} />
          </div>
        )}

        {hasSignatures && (
          <div className="px-5 py-4 space-y-0">
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Signatures</p>
            <SpecRow label="IR Signature" value={ship.ir_signature != null ? ship.ir_signature.toFixed(2) : null} />
            <SpecRow label="EM Signature" value={ship.em_signature != null ? ship.em_signature.toFixed(2) : null} />
            <SpecRow label="Cross-Section (X × Y × Z)" value={ship.cross_section_x != null ? `${ship.cross_section_x} × ${ship.cross_section_y} × ${ship.cross_section_z} m` : null} />
          </div>
        )}

        {hasClaim && (
          <div className="px-5 py-4 space-y-0">
            <p className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">Insurance Claim</p>
            <SpecRow label="Standard Claim" value={ship.claim_time != null ? `${ship.claim_time} min` : null} />
            <SpecRow label="Expedited Claim" value={ship.expedited_claim_time != null ? `${ship.expedited_claim_time} min` : null} />
            <SpecRow label="Expedite Cost" value={ship.expedited_claim_cost != null ? `${ship.expedited_claim_cost.toLocaleString()} aUEC` : null} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Salvage tab ─────────────────────────────────────────────────────────────

const VARIANT_LABELS = {
  derelict_salvage: 'Derelict (Salvage)',
  derelict: 'Derelict',
  boarded: 'Boarded (Mission)',
}

function SalvageTab({ slug }) {
  const { data: salvage, loading, error, refetch } = useShipSalvage(slug)
  const { data: loadout } = useShipLoadout(slug)

  if (loading) return <LoadingState message="Loading salvage data..." />
  if (error && !/not found/i.test(error)) return <ErrorState message={error} onRetry={refetch} />
  if (!salvage || !salvage.variants || salvage.variants.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Salvage yield data is not yet available for this ship.</p>
      </div>
    )
  }

  const components = (loadout || []).filter(r =>
    COMPONENT_TYPES.has(r.port_type) || WEAPON_TYPES.has(r.port_type)
  )

  return (
    <div className="space-y-6">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <h3 className="text-amber-400 font-medium mb-2">Salvage Encounters</h3>
        <p className="text-sm text-gray-400 mb-3">
          This ship can be found as a derelict in space. Components from the base loadout can be stripped via salvage.
        </p>
        <div className="flex flex-wrap gap-2">
          {salvage.variants.map((v, i) => (
            <span key={i} className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300 border border-gray-700">
              {VARIANT_LABELS[v.variant_type] || v.variant_type}
            </span>
          ))}
        </div>
      </div>

      {components.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Salvageable Components ({components.length})
          </h3>
          <div className="grid gap-2">
            {components.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700/50">
                <div>
                  <p className="text-sm font-medium text-gray-200">{c.component_name || c.port_name}</p>
                  <p className="text-xs text-gray-500">
                    {c.port_type?.replace(/_/g, ' ')} &middot; Size {c.component_size || c.size_max}
                    {c.manufacturer_name ? ` \u00b7 ${c.manufacturer_name}` : ''}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400">
                  {c.sub_type || c.component_type || c.port_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShipDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const VALID_TABS = ['overview', 'components', 'weapons', 'interior', 'performance', 'paints', 'salvage']
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = VALID_TABS.includes(tabParam) ? tabParam : 'overview'
  const setActiveTab = useCallback((t) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (t === 'overview') next.delete('tab')
      else next.set('tab', t)
      return next
    }, { replace: true })
  }, [setSearchParams])
  const { data: ship, loading, error, refetch } = useShip(slug)
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  if (loading) return <LoadingState message="Loading ship data..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!ship) return <ErrorState message="Ship not found" />

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/ships')}
            className="btn-ghost flex items-center gap-1.5 text-xs shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Ship Database
          </button>
          <div>
            <h2 className="font-display font-bold text-2xl tracking-wider text-white">{ship.name}</h2>
            {ship.manufacturer_name && (
              <p className="text-sm font-mono text-sc-accent2 mt-0.5">{ship.manufacturer_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="badge badge-size">{ship.size_label}</span>
          {ship.pledge_url && ship.pledge_url.startsWith('https://') && (
            <a
              href={ship.pledge_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <ExternalLink className="w-3 h-3" />
              View on RSI
            </a>
          )}
        </div>
      </div>

      <div className="glow-line" />

      {/* Hero image */}
      <div className="panel overflow-hidden rounded-lg">
        <ShipImage
          src={ship.image_url_large || ship.image_url_medium}
          fallbackSrc={ship.image_url_medium || ship.image_url}
          alt={ship.name}
          aspectRatio="landscape"
        />
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-sc-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-display uppercase tracking-wider transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-sc-accent border-sc-accent'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab ship={ship} isAuthed={isAuthed} />}
      {activeTab === 'components' && <ComponentsTab slug={slug} />}
      {activeTab === 'weapons' && <WeaponsTab slug={slug} />}
      {activeTab === 'interior' && <InteriorTab ship={ship} />}
      {activeTab === 'performance' && <PerformanceTab ship={ship} />}
      {activeTab === 'paints' && <PaintsTab slug={slug} isAuthed={isAuthed} />}
      {activeTab === 'salvage' && <SalvageTab slug={slug} />}
    </div>
  )
}
