import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, CheckCircle, Wrench, Lightbulb,
  Rocket, Package, Users, Zap, Box, Palette, LayoutGrid, List,
  FlaskConical
} from 'lucide-react'
import { useShip, useShipLoadout, useShipPaints } from '../hooks/useAPI'
import ShipImage from '../components/ShipImage'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'components', label: 'Components' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'performance', label: 'Performance' },
  { id: 'paints', label: 'Paints' },
]

const COMPONENT_TYPES = new Set(['power', 'cooler', 'shield', 'quantum_drive', 'sensor', 'jump_drive'])
const WEAPON_TYPES = new Set(['weapon', 'turret', 'missile', 'countermeasure', 'mining_laser', 'salvage_head', 'salvage_module', 'qed'])

// ─── Shared primitives ────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'flight_ready') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sc-success font-mono text-sm">
        <CheckCircle className="w-4 h-4" />
        Flight Ready
      </span>
    )
  }
  if (status === 'in_production') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sc-warn font-mono text-sm">
        <Wrench className="w-4 h-4" />
        In Production
      </span>
    )
  }
  if (status === 'in_concept') {
    return (
      <span className="inline-flex items-center gap-1.5 text-blue-400 font-mono text-sm">
        <Lightbulb className="w-4 h-4" />
        In Concept
      </span>
    )
  }
  if (status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sc-warn font-mono text-sm">
        <Wrench className="w-4 h-4" />
        {status}
      </span>
    )
  }
  return null
}

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

// ─── Overview — Classic ───────────────────────────────────────────────────────

function OverviewTab({ ship }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="panel">
          <div className="panel-header">Specifications</div>
          <div className="p-4 space-y-0">
            <SpecRow label="Role" value={ship.focus} />
            <SpecRow label="Classification" value={ship.classification} />
            <SpecRow label="Size" value={ship.size_label} />
            <SpecRow label="Cargo" value={ship.cargo > 0 ? `${ship.cargo} SCU` : null} />
            <SpecRow label="Crew" value={
              ship.crew_min != null && ship.crew_max != null
                ? ship.crew_min === ship.crew_max
                  ? String(ship.crew_min)
                  : `${ship.crew_min} – ${ship.crew_max}`
                : null
            } />
            <SpecRow label="SCM Speed" value={ship.speed_scm ? `${ship.speed_scm} m/s` : null} />
            <SpecRow label="Max Speed" value={ship.speed_max ? `${ship.speed_max} m/s` : null} />
          </div>
        </div>

        {(ship.length || ship.beam || ship.height || ship.mass || ship.health || ship.vehicle_inventory) && (
          <div className="panel">
            <div className="panel-header">Dimensions &amp; Physical</div>
            <div className="p-4 space-y-0">
              {(ship.length || ship.beam || ship.height) && (
                <SpecRow
                  label="L × B × H"
                  value={`${ship.length ?? '?'} × ${ship.beam ?? '?'} × ${ship.height ?? '?'} m`}
                />
              )}
              <SpecRow label="Mass" value={ship.mass ? `${ship.mass.toLocaleString()} kg` : null} />
              <SpecRow label="Hull Health" value={ship.health ? ship.health.toLocaleString() : null} />
              <SpecRow label="Vehicle Storage" value={ship.vehicle_inventory ? `${ship.vehicle_inventory} SCU` : null} />
            </div>
          </div>
        )}

        {ship.description && (
          <div className="panel">
            <div className="panel-header">Description</div>
            <p className="p-4 text-sm text-gray-400 leading-relaxed">{ship.description}</p>
          </div>
        )}
      </div>

      <OverviewRightCol ship={ship} />
    </div>
  )
}

// ─── Overview — Enhanced ──────────────────────────────────────────────────────

function OverviewTabEnhanced({ ship }) {
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
            <SpecRow label="Cargo" value={ship.cargo > 0 ? `${ship.cargo} SCU` : null} />
            <SpecRow label="Vehicle Storage" value={ship.vehicle_inventory ? `${ship.vehicle_inventory} SCU` : null} />
            {/* Speed */}
            <SpecRow label="SCM Speed" value={ship.speed_scm ? `${ship.speed_scm} m/s` : null} />
            <SpecRow label="SCM Boost Back" value={ship.boost_speed_back ? `${ship.boost_speed_back} m/s` : null} />
            <SpecRow label="Max Speed" value={ship.speed_max ? `${ship.speed_max} m/s` : null} />
            {/* Maneuvering */}
            <SpecRow label="Pitch / Yaw / Roll" value={pyr} />
            {/* Physical */}
            <SpecRow label="Dimensions (L × B × H)" value={dims} />
            <SpecRow label="Mass" value={ship.mass ? `${ship.mass.toLocaleString()} kg` : null} />
            <SpecRow label="Hull Health" value={ship.health ? ship.health.toLocaleString() : null} />
            {/* Propulsion */}
            <SpecRow label="H₂ Fuel" value={ship.fuel_capacity_hydrogen != null ? `${ship.fuel_capacity_hydrogen} SCU` : null} />
            <SpecRow label="QT Fuel" value={ship.fuel_capacity_quantum != null ? `${ship.fuel_capacity_quantum} SCU` : null} />
            <SpecRow label="Main Thrusters" value={ship.thruster_count_main != null ? String(ship.thruster_count_main) : null} />
            <SpecRow label="Maneuvering Thrusters" value={ship.thruster_count_maneuvering != null ? String(ship.thruster_count_maneuvering) : null} />
          </div>
        </div>

        {ship.description && (
          <div className="panel">
            <div className="panel-header">Description</div>
            <p className="p-4 text-sm text-gray-400 leading-relaxed">{ship.description}</p>
          </div>
        )}
      </div>

      <OverviewRightCol ship={ship} />
    </div>
  )
}

// ─── Loadout — Classic ────────────────────────────────────────────────────────

function LoadoutItems({ items, emptyIcon: Icon, emptyMessage }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Icon className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  const grouped = items.reduce((acc, item) => {
    const cat = item.category_label
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-2 px-4 py-1.5 text-xs text-gray-600 uppercase tracking-wider">
        <span className="col-span-3">Hardpoint</span>
        <span className="col-span-3">Component</span>
        <span className="col-span-1 text-center">Size</span>
        <span className="col-span-1 text-center">Grade</span>
        <span className="col-span-1">Class</span>
        <span className="col-span-3 text-right">Manufacturer</span>
      </div>
      {Object.entries(grouped).map(([category, rows]) => (
        <div key={category} className="panel overflow-hidden">
          <div className="panel-header">{category}</div>
          <div className="divide-y divide-sc-border/30">
            {rows.map((item, i) => {
              const sz = item.component_size ?? (item.size_max > 0 ? item.size_max : null)
              const label = rows.length > 1 ? `${category} ${i}` : category
              return (
                <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center">
                  <span className="col-span-3 text-xs text-gray-400 truncate" title={item.port_name}>
                    {label}
                  </span>
                  <span className={`col-span-3 text-sm truncate ${item.component_name ? 'text-white' : 'text-gray-600 italic'}`} title={item.component_name || ''}>
                    {item.component_name || '—'}
                  </span>
                  <span className="col-span-1 text-xs font-mono text-sc-accent2 text-center">
                    {sz != null ? `S${sz}` : '—'}
                  </span>
                  <span className="col-span-1 text-xs font-mono text-gray-400 text-center">
                    {item.grade || '—'}
                  </span>
                  <span className="col-span-1 text-xs text-gray-500 truncate">
                    {item.component_class || '—'}
                  </span>
                  <span className="col-span-3 text-xs text-gray-500 text-right">
                    {item.manufacturer_name || '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Loadout — Enhanced ───────────────────────────────────────────────────────

function LoadoutItemsEnhanced({ items, emptyIcon: Icon, emptyMessage }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Icon className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  const grouped = items.reduce((acc, item) => {
    const cat = item.category_label
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, rows]) => (
        <div key={category} className="panel overflow-hidden">
          <div className="panel-header">
            {category}
            <span className="text-gray-600 font-normal ml-1.5">({rows.length})</span>
          </div>
          <div className="divide-y divide-sc-border/20">
            {rows.map((item, i) => {
              const sz = item.component_size ?? (item.size_max > 0 ? item.size_max : null)
              const hasComponent = !!item.component_name
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  {/* Size badge */}
                  <div className={`shrink-0 w-10 h-10 rounded flex items-center justify-center font-mono font-bold text-sm border ${
                    hasComponent
                      ? 'border-sc-accent/40 text-sc-accent bg-sc-accent/5'
                      : 'border-sc-border/40 text-gray-600'
                  }`}>
                    {sz != null ? `S${sz}` : '—'}
                  </div>

                  {/* Name + sub-line */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-mono ${hasComponent ? 'text-white' : 'text-gray-600 italic'}`}>
                      {item.component_name || 'Empty'}
                    </p>
                    {(item.grade || item.component_class) && (
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
                  </div>

                  {/* Manufacturer */}
                  <div className="shrink-0 text-xs text-gray-500 text-right max-w-[160px]">
                    {item.manufacturer_name || ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Component / Weapon tabs ──────────────────────────────────────────────────

function ComponentsTab({ slug, layout }) {
  const { data: loadout, loading, error } = useShipLoadout(slug)
  if (loading) return <LoadingState message="Loading components..." />
  if (error) return <ErrorState message={error} />
  const items = (loadout || []).filter(r => COMPONENT_TYPES.has(r.port_type))
  const Comp = layout === 'enhanced' ? LoadoutItemsEnhanced : LoadoutItems
  return <Comp items={items} emptyIcon={Box} emptyMessage="No component data available" />
}

function WeaponsTab({ slug, layout }) {
  const { data: loadout, loading, error } = useShipLoadout(slug)
  if (loading) return <LoadingState message="Loading weapons..." />
  if (error) return <ErrorState message={error} />
  const items = (loadout || []).filter(r => WEAPON_TYPES.has(r.port_type))
  const Comp = layout === 'enhanced' ? LoadoutItemsEnhanced : LoadoutItems
  return <Comp items={items} emptyIcon={Rocket} emptyMessage="No weapon hardpoints" />
}

// ─── Paints tab ───────────────────────────────────────────────────────────────

function PaintsTab({ slug }) {
  const { data: paints, loading, error } = useShipPaints(slug)
  const [view, setView] = useState('list')

  if (loading) return <LoadingState message="Loading paints..." />
  if (error) return <ErrorState message={error} />

  if (!paints || paints.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Palette className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No paints available</p>
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span>Paints <span className="text-gray-500 font-normal">({paints.length})</span></span>
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
            return (
              <div key={paint.id} className="flex items-center gap-4 px-4 py-3">
                <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-sc-surface border border-sc-border/40 flex items-center justify-center">
                  {thumb
                    ? <img src={thumb} alt={paint.name} className="w-full h-full object-cover" />
                    : <Palette className="w-5 h-5 text-gray-600" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-mono text-gray-200">{paint.name}</p>
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
            return (
              <div key={paint.id} className="bg-sc-surface border border-sc-border/40 rounded overflow-hidden">
                <div className="aspect-square flex items-center justify-center bg-sc-bg">
                  {thumb
                    ? <img src={thumb} alt={paint.name} className="w-full h-full object-cover" />
                    : <Palette className="w-8 h-8 text-gray-600" />
                  }
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

// ─── Performance — Classic ────────────────────────────────────────────────────

function PerformanceTab({ ship }) {
  const hasSpeed = ship.speed_scm || ship.speed_max || ship.boost_speed_back
  const hasManeuvering = ship.angular_velocity_pitch || ship.angular_velocity_yaw || ship.angular_velocity_roll
  const hasPropulsion = ship.fuel_capacity_hydrogen || ship.fuel_capacity_quantum || ship.thruster_count_main || ship.thruster_count_maneuvering

  if (!hasSpeed && !hasManeuvering && !hasPropulsion) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Zap className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No performance data available</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="panel">
        <div className="panel-header">Speeds</div>
        <div className="p-4 space-y-0">
          <SpecRow label="SCM Speed" value={ship.speed_scm ? `${ship.speed_scm} m/s` : null} />
          <SpecRow label="Max Speed" value={ship.speed_max ? `${ship.speed_max} m/s` : null} />
          <SpecRow label="Boost Backward" value={ship.boost_speed_back ? `${ship.boost_speed_back} m/s` : null} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Maneuvering</div>
        <div className="p-4 space-y-0">
          <SpecRow label="Pitch" value={ship.angular_velocity_pitch != null ? `${ship.angular_velocity_pitch} °/s` : null} />
          <SpecRow label="Yaw" value={ship.angular_velocity_yaw != null ? `${ship.angular_velocity_yaw} °/s` : null} />
          <SpecRow label="Roll" value={ship.angular_velocity_roll != null ? `${ship.angular_velocity_roll} °/s` : null} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Propulsion</div>
        <div className="p-4 space-y-0">
          <SpecRow label="H₂ Fuel" value={ship.fuel_capacity_hydrogen != null ? `${ship.fuel_capacity_hydrogen} SCU` : null} />
          <SpecRow label="QT Fuel" value={ship.fuel_capacity_quantum != null ? `${ship.fuel_capacity_quantum} SCU` : null} />
          <SpecRow label="Main Thrusters" value={ship.thruster_count_main != null ? String(ship.thruster_count_main) : null} />
          <SpecRow label="Maneuvering Thrusters" value={ship.thruster_count_maneuvering != null ? String(ship.thruster_count_maneuvering) : null} />
        </div>
      </div>
    </div>
  )
}

// ─── Performance — Enhanced ───────────────────────────────────────────────────

function PerformanceTabEnhanced({ ship }) {
  const hasSpeed = ship.speed_scm || ship.speed_max || ship.boost_speed_back
  const hasManeuvering = ship.angular_velocity_pitch != null || ship.angular_velocity_yaw != null || ship.angular_velocity_roll != null
  const hasPropulsion = ship.fuel_capacity_hydrogen || ship.fuel_capacity_quantum || ship.thruster_count_main || ship.thruster_count_maneuvering

  if (!hasSpeed && !hasManeuvering && !hasPropulsion) {
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
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShipDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [layout, setLayout] = useState('classic')
  const { data: ship, loading, error } = useShip(slug)

  if (loading) return <LoadingState message="Loading ship data..." />
  if (error) return <ErrorState message={error} />
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
          {ship.pledge_url && (
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

      {/* Tab bar + A/B toggle */}
      <div className="flex items-center justify-between border-b border-sc-border">
        <div className="flex items-center gap-1">
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

        {/* Layout toggle */}
        <div className="flex items-center gap-2 pb-1">
          <span className="flex items-center gap-1 text-xs text-gray-600 font-mono uppercase tracking-wider">
            <FlaskConical className="w-3.5 h-3.5" />
            A/B
          </span>
          <div className="flex rounded overflow-hidden border border-sc-border/60">
            {[
              { id: 'classic', label: 'Classic' },
              { id: 'enhanced', label: 'Enhanced' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setLayout(opt.id)}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors ${
                  layout === opt.id
                    ? 'bg-sc-accent/15 text-sc-accent'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        layout === 'enhanced'
          ? <OverviewTabEnhanced ship={ship} />
          : <OverviewTab ship={ship} />
      )}
      {activeTab === 'components' && <ComponentsTab slug={slug} layout={layout} />}
      {activeTab === 'weapons' && <WeaponsTab slug={slug} layout={layout} />}
      {activeTab === 'performance' && (
        layout === 'enhanced'
          ? <PerformanceTabEnhanced ship={ship} />
          : <PerformanceTab ship={ship} />
      )}
      {activeTab === 'paints' && <PaintsTab slug={slug} />}
    </div>
  )
}
