import { X } from 'lucide-react'
import ShipImage from './ShipImage'
import InsuranceBadge from './InsuranceBadge'
import StatusBadge from './StatusBadge'
import { wornPaintName } from '../lib/paints'

export default function ShipDetailPanel({ ship, onClose }) {
  if (!ship) return null

  // Parse pledge cost for display
  const rawCost = ship.pledge_cost || ''
  const costMatch = rawCost.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  const costNum = costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0
  const pledgeDisplay = costNum > 0 ? `$${Math.round(costNum).toLocaleString('en-US')}` : null

  const specs = [
    { label: 'Role', value: ship.focus },
    { label: 'Classification', value: ship.classification },
    { label: 'Size', value: ship.size_label, badge: true },
    { label: 'Cargo', value: ship.cargo ? `${ship.cargo.toLocaleString()} SCU` : null },
    { label: 'Crew', value: (ship.crew_min || ship.crew_max) ? `${ship.crew_min || 0}–${ship.crew_max || 0}` : null },
    { label: 'Speed', value: ship.speed_scm ? `${ship.speed_scm} m/s` : null },
  ]

  return (
    <div className="panel animate-slide-in-right sticky top-4">
      <button
        onClick={onClose}
        className="absolute top-3 right-4 z-10 p-1 text-gray-500 hover:text-white transition-colors"
        aria-label="Close detail panel"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Ship Image */}
      <ShipImage
        render={ship.render}
        src={ship.image_url}
        alt={ship.vehicle_name}
        aspectRatio="landscape"
        className="border-b border-sc-border"
      />

      {/* Name Block */}
      <div className="px-5 py-4 border-b border-sc-border">
        <h2 className="font-display font-bold text-lg text-white leading-tight">{ship.vehicle_name}</h2>
        {ship.custom_name && (
          <p className="text-sm text-sc-accent italic mt-0.5">"{ship.custom_name}"</p>
        )}
        {ship.manufacturer_name && (
          <p className="text-xs font-mono text-gray-500 mt-1">
            {ship.manufacturer_name}
            {ship.manufacturer_code && <span className="text-gray-600"> ({ship.manufacturer_code})</span>}
          </p>
        )}
      </div>

      {/* Specs Grid */}
      <div className="px-5 py-4 bg-grid border-b border-sc-border">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {specs.map(({ label, value, badge }) => value && (
            <div key={label}>
              <p className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
              {badge ? (
                <span className="badge badge-size">{value}</span>
              ) : (
                <p className="text-sm text-gray-300 font-mono">{value}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pledge & Insurance */}
      <div className="px-5 py-4 space-y-3">
        {pledgeDisplay && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Pledge</span>
            <span className="text-sm font-mono text-sc-accent font-semibold">{pledgeDisplay}</span>
          </div>
        )}
        {ship.pledge_date && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Pledge Date</span>
            <span className="text-sm font-mono text-gray-400">{ship.pledge_date}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Insurance</span>
          <InsuranceBadge isLifetime={ship.is_lifetime} label={ship.insurance_label} />
        </div>
        {wornPaintName(ship) && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Paint</span>
            <span className="text-sm font-mono text-gray-400">{wornPaintName(ship)}</span>
          </div>
        )}
        {ship.production_status && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Status</span>
            <StatusBadge status={ship.production_status} size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}
