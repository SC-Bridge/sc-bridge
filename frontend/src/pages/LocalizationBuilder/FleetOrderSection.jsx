import React, { useMemo } from 'react'
import { GripVertical, X, Plus, Ship } from 'lucide-react'
import SearchInput from '../../components/SearchInput'
import useDragReorder from './useDragReorder'

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-sc-accent' : 'bg-gray-700'}`}
    >
      <span className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-[2px] ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  )
}

export default function FleetOrderSection({
  config, orderedShips, allShips, fleet, shipSearch, setShipSearch,
  onToggle, onReorder, onRemove, onAdd, onAddFromFleet, onUpdateCustomLabel,
  readOnly = false,
}) {
  const shipDrag = useDragReorder(orderedShips, onReorder)

  const padPos = (n) => {
    const width = orderedShips.length >= 10 ? 2 : 1
    return String(n).padStart(width, '0')
  }

  // Fleet ships not yet in the order list — shown as "add from fleet"
  const unorderedFleet = useMemo(() => {
    if (!fleet) return []
    const existing = new Set(orderedShips.map(s => s.vehicleId))
    // Dedup by vehicle_id (user may own duplicates)
    const seen = new Set()
    return fleet.filter(f => {
      if (existing.has(f.vehicle_id) || seen.has(f.vehicle_id)) return false
      seen.add(f.vehicle_id)
      return true
    })
  }, [fleet, orderedShips])

  // Search results — ships from the full DB not in fleet or order list
  const shipSearchResults = useMemo(() => {
    if (!allShips || !shipSearch || shipSearch.length < 2) return []
    const term = shipSearch.toLowerCase()
    const existing = new Set(orderedShips.map(s => s.vehicleId))
    return allShips
      .filter(s => !existing.has(s.id) && (
        s.name?.toLowerCase().includes(term) ||
        s.manufacturer_name?.toLowerCase().includes(term)
      ))
      .slice(0, 8)
  }, [allShips, shipSearch, orderedShips])

  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-sm text-white">ASOP Terminal Ship Order</h3>
          <p className="text-xs text-gray-500 mt-0.5">Drag to reorder your ships. Custom names appear in-game as &ldquo;01. Aegis Carrack &ldquo;Jean-Luc&rdquo;&rdquo;</p>
        </div>
        <Toggle checked={config.asopEnabled || false} onChange={onToggle} />
      </div>

      {config.asopEnabled && (
        <div className="p-4 space-y-4">
          {readOnly && (
            <p className="text-xs text-gray-400">
              Choose one account to rearrange its order. The download uses this combined order.
            </p>
          )}

          {/* Ordered ship list — drag to reorder */}
          {orderedShips.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{readOnly ? 'Combined ship order' : 'Your ship order (drag to reorder)'}</p>
              <div ref={shipDrag.containerRef} className="space-y-1 max-h-[28rem] overflow-y-auto">
                {orderedShips.map((ship, idx) => (
                  <div
                    key={`${ship.vehicleId}-${idx}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded border select-none transition-colors group ${
                      shipDrag.dragIdx === idx ? 'opacity-40 bg-black/20 border-sc-accent/40' :
                      shipDrag.overIdx === idx && shipDrag.dragIdx !== null ? 'bg-sc-accent/10 border-sc-accent' :
                      'bg-black/20 border-sc-border hover:border-sc-accent/30'
                    }`}
                  >
                    <span className="text-sc-accent font-mono text-xs w-6 text-right shrink-0">{padPos(ship.sortPosition)}.</span>
                    {!readOnly && (
                      <GripVertical
                        aria-label="Drag to reorder"
                        className="w-3.5 h-3.5 text-gray-500 shrink-0 cursor-grab active:cursor-grabbing touch-none"
                        onPointerDown={(e) => shipDrag.startDrag(e, idx)}
                      />
                    )}
                    <span className="text-xs text-gray-200 flex-1 truncate">
                      {ship.vehicleName}
                      {ship.customLabel && (
                        <span className="text-sc-accent/70 ml-1">&ldquo;{ship.customLabel}&rdquo;</span>
                      )}
                    </span>
                    {!readOnly && (
                    <button aria-label={`Remove ${ship.vehicleName}`} onClick={() => onRemove(idx)} className="p-0.5 rounded hover:bg-red-500/20 opacity-0 group-hover:opacity-100 hover:!opacity-100 cursor-pointer">
                      <X className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                    </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Ship className="w-8 h-8 mx-auto mb-2 text-gray-700" />
              <p className="text-sm text-gray-500">No ships in your order yet.</p>
              <p className="text-xs text-gray-600 mt-1">Add ships from your fleet below, or search for in-game purchases.</p>
            </div>
          )}

          {/* Fleet ships not yet added */}
          {!readOnly && unorderedFleet.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                Your fleet ({unorderedFleet.length} ships not yet added)
              </p>
              <div className="border border-sc-border rounded bg-black/20 overflow-hidden max-h-48 overflow-y-auto">
                {unorderedFleet.map(f => (
                  <button
                    key={f.vehicle_id}
                    onClick={() => onAddFromFleet(f)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-sc-accent/10 transition-colors border-b border-sc-border/30 last:border-b-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-sc-accent shrink-0" />
                    <span className="text-xs text-gray-200 flex-1 truncate">
                      {f.vehicle_name}
                      {f.custom_name && (
                        <span className="text-sc-accent/70 ml-1">&ldquo;{f.custom_name}&rdquo;</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search for ships not in fleet (in-game aUEC purchases) */}
          {!readOnly && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              Add other ships (in-game purchases, not in your hangar)
            </p>
            <SearchInput
              value={shipSearch}
              onChange={setShipSearch}
              placeholder="Search ships to add..."
            />
            {shipSearchResults.length > 0 && (
              <div className="border border-sc-border rounded bg-black/40 overflow-hidden max-h-48 overflow-y-auto">
                {shipSearchResults.map(ship => (
                  <button
                    key={ship.id}
                    onClick={() => onAdd(ship)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-sc-accent/10 transition-colors border-b border-sc-border last:border-b-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-sc-accent shrink-0" />
                    <span className="text-xs text-gray-200 flex-1">{ship.name}</span>
                    {ship.manufacturer_name && (
                      <span className="text-[10px] text-gray-500">{ship.manufacturer_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
