import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, CheckCircle, Wrench, Lightbulb,
  Rocket, Package, Users, Zap, Box
} from 'lucide-react'
import { useShip, useShipLoadout, useShipPaints } from '../hooks/useAPI'
import ShipImage from '../components/ShipImage'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'loadout', label: 'Loadout' },
  { id: 'paints', label: 'Paints' },
]

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

function OverviewTab({ ship }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left column */}
      <div className="lg:col-span-2 space-y-4">
        {/* Specs */}
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

        {/* Dimensions */}
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

        {/* Description */}
        {ship.description && (
          <div className="panel">
            <div className="panel-header">Description</div>
            <p className="p-4 text-sm text-gray-400 leading-relaxed">{ship.description}</p>
          </div>
        )}
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Pricing */}
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

        {/* Production Status */}
        <div className="panel">
          <div className="panel-header">Status</div>
          <div className="p-4">
            <StatusBadge status={ship.production_status} />
          </div>
        </div>

        {/* Acquisition */}
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
    </div>
  )
}

function formatPortName(name) {
  return name
    .replace(/^hardpoint_/, '')
    .replace(/missilerack/g, 'missile_rack')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function LoadoutTab({ slug }) {
  const { data: loadout, loading, error } = useShipLoadout(slug)

  if (loading) return <LoadingState message="Loading loadout..." />
  if (error) return <ErrorState message={error} />

  if (!loadout || loadout.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Box className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No loadout data available</p>
      </div>
    )
  }

  // Group by category_label
  const grouped = loadout.reduce((acc, item) => {
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
        <span className="col-span-2">Type</span>
        <span className="col-span-2 text-right">Manufacturer</span>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="panel overflow-hidden">
          <div className="panel-header">{category}</div>
          <div className="divide-y divide-sc-border/30">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center">
                <span className="col-span-3 text-xs text-gray-400 truncate" title={item.port_name}>
                  {formatPortName(item.port_name)}
                </span>
                <span className={`col-span-3 text-sm truncate ${item.component_name ? 'text-white' : 'text-gray-600 italic'}`} title={item.component_name || ''}>
                  {item.component_name || '—'}
                </span>
                <span className="col-span-1 text-xs font-mono text-sc-accent2 text-center">
                  {item.component_size != null ? `S${item.component_size}` : '—'}
                </span>
                <span className="col-span-1 text-xs font-mono text-gray-400 text-center">
                  {item.grade || '—'}
                </span>
                <span className="col-span-2 text-xs text-gray-500 truncate">
                  {item.sub_type || '—'}
                </span>
                <span className="col-span-2 text-xs text-gray-500 truncate text-right" title={item.manufacturer_name}>
                  {item.manufacturer_name || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PaintsTab({ slug }) {
  const { data: paints, loading, error } = useShipPaints(slug)

  if (loading) return <LoadingState message="Loading paints..." />
  if (error) return <ErrorState message={error} />

  if (!paints || paints.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Rocket className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No paints available</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {paints.map((paint) => (
        <div key={paint.id} className="panel overflow-hidden group">
          <ShipImage
            src={paint.image_url_small || paint.image_url_medium || paint.image_url}
            fallbackSrc={paint.image_url_medium || paint.image_url}
            alt={paint.name}
            aspectRatio="square"
          />
          <div className="p-2">
            <p className="text-xs font-mono text-gray-300 truncate" title={paint.name}>{paint.name}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ShipDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
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

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-sc-border">
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
      {activeTab === 'overview' && <OverviewTab ship={ship} />}
      {activeTab === 'loadout' && <LoadoutTab slug={slug} />}
      {activeTab === 'paints' && <PaintsTab slug={slug} />}
    </div>
  )
}
