import React, { useState, useMemo } from 'react'
import { X, ShoppingCart, Star, Diamond, Package, Search, ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { useCompatibleComponents } from '../../hooks/useAPI'
import LoadingState from '../../components/LoadingState'
import { getColumnsForPortType, getDefaultSortKey, PORT_TYPE_LABELS, SlotThumb } from './loadoutHelpers'

/**
 * Full-screen sortable data grid for selecting compatible components.
 * Uses a real HTML table for proper column alignment and auto-sizing.
 */
export default function ComponentPicker({ slug, portId, portType, currentOverride, onSelect, onAddToCart, onClose }) {
  const { data, loading, error } = useCompatibleComponents(slug, portId)
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState(() => getDefaultSortKey(portType))
  const [sortDir, setSortDir] = useState('desc')
  const [showSmaller, setShowSmaller] = useState(false)
  const [mfrFilter, setMfrFilter] = useState('')
  const [dmgFilter, setDmgFilter] = useState('')

  const equippedUuid = currentOverride?.component_uuid || null

  const actualType = useMemo(() => {
    if (!data?.components?.length) return portType
    const firstType = data.components[0]?.type
    const TYPE_TO_PORT = {
      WeaponMining: 'mining_laser',
      SalvageHead: 'salvage_head',
      SalvageModifier: 'salvage_module',
      TractorBeam: 'turret',
      MiningModifier: 'mining_laser',
    }
    return TYPE_TO_PORT[firstType] || portType
  }, [data, portType])

  const columns = getColumnsForPortType(actualType)

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manufacturer_name' ? 'asc' : 'desc')
    }
  }

  // Derive available filter options from the data
  const manufacturers = useMemo(() => {
    if (!data?.components) return []
    return [...new Set(data.components.map(c => c.manufacturer_name).filter(Boolean))].sort()
  }, [data])

  const damageTypes = useMemo(() => {
    if (!data?.components) return []
    return [...new Set(data.components.map(c => c.damage_type).filter(Boolean))].sort()
  }, [data])

  const maxSize = data?.size_max || 0

  const sorted = useMemo(() => {
    if (!data?.components) return []
    const lowerFilter = filter.toLowerCase()
    let filtered = data.components.filter(c => {
      // Size filter: hide smaller by default
      if (!showSmaller && maxSize > 0 && c.size < maxSize) return false
      // Text filter
      if (lowerFilter && !c.name?.toLowerCase().includes(lowerFilter) && !c.manufacturer_name?.toLowerCase().includes(lowerFilter)) return false
      // Manufacturer filter
      if (mfrFilter && c.manufacturer_name !== mfrFilter) return false
      // Damage type filter
      if (dmgFilter && c.damage_type !== dmgFilter) return false
      return true
    })

    filtered.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return filtered
  }, [data, filter, sortKey, sortDir, showSmaller, maxSize, mfrFilter, dmgFilter])

  const totalCount = data?.components?.length || 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[3vh] pb-[3vh] px-[3vw] bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0c1018] border border-white/10 rounded-xl shadow-2xl shadow-black/50 w-full max-w-[92vw] max-h-[94vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white tracking-wide">
              Select {PORT_TYPE_LABELS[actualType] || PORT_TYPE_LABELS[portType] || portType}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              Size {data?.size_min === data?.size_max ? data?.size_min : `${data?.size_min}–${data?.size_max}`}
              {' · '}<span className="text-gray-300">{totalCount}</span> compatible
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Legend */}
            <div className="hidden lg:flex items-center gap-3 text-xs text-gray-500 mr-2">
              <span className="flex items-center gap-1"><Star className="w-3 h-3 text-sc-accent" /> Equipped</span>
              <span className="flex items-center gap-1"><Diamond className="w-3 h-3 text-amber-400" /> Default</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Filter by name or manufacturer..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-white/[0.05] border border-white/10 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sc-accent/40 focus:bg-white/[0.07] w-64 transition-colors"
                autoFocus
              />
            </div>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] rounded-lg transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {!loading && !error && (data?.components?.length > 0) && (
          <div className="flex items-center gap-2 px-6 py-2 border-b border-white/10 bg-white/[0.01] flex-shrink-0 flex-wrap">
            {/* Size toggle */}
            {maxSize > 0 && data?.size_min < maxSize && (
              <button
                onClick={() => setShowSmaller(!showSmaller)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  showSmaller
                    ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30'
                    : 'bg-white/[0.04] text-gray-400 border-white/10 hover:text-gray-300'
                }`}
              >
                {showSmaller ? `All Sizes (${data.size_min}–${maxSize})` : `Size ${maxSize} Only`}
              </button>
            )}

            {/* Manufacturer filter */}
            {manufacturers.length > 1 && (
              <select
                value={mfrFilter}
                onChange={e => setMfrFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white/[0.04] border border-white/10 rounded-md text-gray-300 focus:outline-none focus:border-sc-accent/40 cursor-pointer"
              >
                <option value="">All Manufacturers</option>
                {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            {/* Damage type filter */}
            {damageTypes.length > 1 && (
              <select
                value={dmgFilter}
                onChange={e => setDmgFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white/[0.04] border border-white/10 rounded-md text-gray-300 focus:outline-none focus:border-sc-accent/40 cursor-pointer"
              >
                <option value="">All Damage Types</option>
                {damageTypes.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            {/* Active filter count */}
            <span className="text-xs text-gray-500 ml-auto">{sorted.length} of {totalCount} shown</span>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && <div className="p-12"><LoadingState /></div>}
          {error && <div className="p-6 text-red-400 text-sm">{error}</div>}

          {!loading && !error && (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#111827] border-b border-white/10">
                  <th className="w-10 px-2" /> {/* indicator */}
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-gray-200
                        ${sortKey === col.key ? 'text-sc-accent' : 'text-gray-500'}
                        ${col.align === 'left' ? 'text-left' : 'text-right'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-25" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center" style={{ minWidth: 160 }}>Status</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right" style={{ minWidth: 140 }}>Price</th>
                  <th className="w-10" /> {/* cart */}
                </tr>
              </thead>
              <tbody>
                {sorted.map((comp, idx) => {
                  // isDefault: this is the factory/stock component for this port (always from API)
                  const isDefault = !!comp.is_stock
                  // isEquipped: what the user currently has selected
                  // - with override: matches the override UUID
                  // - without override: the default IS the equipped
                  const isEquipped = equippedUuid ? comp.uuid === equippedUuid : isDefault
                  const hasBuyShop = comp.shops?.length > 0
                  const cheapestShop = hasBuyShop ? comp.shops.reduce((a, b) => (a.buy_price || Infinity) < (b.buy_price || Infinity) ? a : b) : null
                  const stripe = idx % 2 === 1
                  const highlighted = isEquipped || isDefault

                  return (
                    <tr
                      key={comp.id}
                      onClick={() => onSelect(comp)}
                      className={`cursor-pointer transition-colors duration-150 group border-l-2
                        ${isEquipped
                          ? 'bg-sc-accent/[0.12] border-l-sc-accent hover:bg-sc-accent/[0.18]'
                          : isDefault
                            ? 'bg-amber-500/[0.06] border-l-amber-500/60 hover:bg-amber-500/[0.10]'
                            : `border-l-transparent ${stripe ? 'bg-white/[0.02]' : 'bg-transparent'} hover:bg-white/[0.06]`
                        }`}
                    >
                      {/* Row indicator */}
                      <td className="px-2 py-0 text-center">
                        {isEquipped && <Check className="w-4 h-4 text-sc-accent mx-auto" />}
                        {isDefault && !isEquipped && <Diamond className="w-3.5 h-3.5 text-amber-400 mx-auto" />}
                      </td>

                      {/* Data columns */}
                      {columns.map(col => {
                        const raw = comp[col.key]
                        const display = raw != null ? (col.format ? col.format(raw) : String(raw)) : '—'
                        const isName = col.key === 'name'
                        const isMfr = col.key === 'manufacturer_name'
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 whitespace-nowrap
                              ${col.align === 'left' ? 'text-left' : 'text-right'}
                              ${isName
                                ? `text-sm font-medium ${isEquipped ? 'text-sc-accent' : isDefault ? 'text-amber-300' : 'text-gray-100'}`
                                : isMfr
                                  ? 'text-sm text-gray-400'
                                  : 'text-sm tabular-nums text-gray-300'
                              }`}
                          >
                            {isName ? (
                              <span className="flex items-center gap-2">
                                <SlotThumb item={comp} title={comp.name} aspectRatio="row" />
                                <span className="truncate block max-w-[280px]" title={display}>{display}</span>
                              </span>
                            ) : isMfr ? (
                              <span className="truncate block max-w-[180px]" title={display}>{display}</span>
                            ) : (
                              display === '—' ? <span className="text-gray-600">—</span> : display
                            )}
                          </td>
                        )
                      })}

                      {/* Status badges — shown independently, a component can be both */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEquipped && (
                            <span className="text-[11px] font-semibold text-sc-accent bg-sc-accent/15 px-2 py-0.5 rounded-full">
                              Equipped
                            </span>
                          )}
                          {isDefault && (
                            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Price / availability */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {comp.in_collection ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <Package className="w-3.5 h-3.5" /> Collected
                          </span>
                        ) : comp.on_ships?.length > 0 ? (
                          <span className="text-xs text-sc-accent truncate block max-w-[160px]" title={`On ${comp.on_ships[0].custom_name || comp.on_ships[0].ship_name}`}>
                            On {comp.on_ships[0].custom_name || comp.on_ships[0].ship_name}
                          </span>
                        ) : hasBuyShop && cheapestShop?.buy_price ? (
                          <span className="text-xs font-medium text-emerald-400 tabular-nums"
                            title={[cheapestShop.shop_name, cheapestShop.location_label].filter(Boolean).join(', ')}>
                            {Math.round(Number(cheapestShop.buy_price)).toLocaleString()} aUEC
                          </span>
                        ) : hasBuyShop ? (
                          <span className="text-xs text-emerald-400">Buy</span>
                        ) : (
                          <span className="text-xs text-orange-400/80">Loot Only</span>
                        )}
                      </td>

                      {/* Cart */}
                      <td className="px-2 py-0 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onAddToCart(comp) }}
                          className="p-1.5 text-gray-700 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-white/[0.05]"
                          title="Add to cart"
                          aria-label={`Add ${comp.name} to cart`}
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div className="p-12 text-center text-gray-500 text-sm">No compatible components found.</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-white/10 text-xs text-gray-500 flex items-center justify-between flex-shrink-0 bg-[#0c1018]">
          <span>{sorted.length} of {totalCount} shown</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-sc-accent" /> Equipped</span>
            <span className="flex items-center gap-1.5"><Diamond className="w-3.5 h-3.5 text-amber-400" /> Default</span>
            <span className="text-emerald-400">aUEC = Purchasable</span>
            <span className="text-orange-400/80">Loot Only</span>
          </div>
        </div>
      </div>
    </div>
  )
}
