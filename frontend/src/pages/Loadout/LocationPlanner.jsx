import React, { useState, useMemo } from 'react'
import { MapPin, ChevronDown, ChevronRight, ShoppingCart } from 'lucide-react'
import { groupLoadoutByLocation, fmtInt } from './loadoutHelpers'

// #94 — expandable "Location Planner" below the loadout builder. Shows where to
// buy each component in the active loadout, grouped by the cheapest shop, with a
// per-shop subtotal and a grand total. Components with no buyable shop fall into
// a "Loot only" bucket. Shop data already rides on each component (loadout.ts
// shopMap), so this is a pure client-side aggregation — no extra fetch.
export default function LocationPlanner({ components }) {
  const [open, setOpen] = useState(false)
  const { groups, lootOnly, totalCost } = useMemo(
    () => groupLoadoutByLocation(components),
    [components],
  )

  const shopCount = groups.length
  if (shopCount === 0 && lootOnly.length === 0) return null

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <MapPin className="w-4 h-4 text-sc-accent" />
        <span className="text-sm font-medium text-gray-200">Location Planner</span>
        <span className="text-xs text-gray-500">
          {shopCount} shop{shopCount !== 1 ? 's' : ''}
          {lootOnly.length > 0 && ` · ${lootOnly.length} loot-only`}
        </span>
        {totalCost > 0 && (
          <span className="ml-auto text-xs text-amber-300 flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" />
            {fmtInt(totalCost)} aUEC
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-white/[0.06]">
          <p className="px-4 pt-3 text-[11px] text-gray-500">
            Cheapest shop per component. Use the cart’s <span className="text-gray-400">Optimize Shops</span> for a
            minimum-stops route.
          </p>
          {groups.map((g, gi) => (
            <div key={gi} className="border-b border-white/[0.04] last:border-b-0">
              <div className="px-4 py-2 bg-white/[0.03] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-300 truncate">{g.shop_name || 'Unknown shop'}</span>
                  {g.location_label && <span className="text-[11px] text-gray-500 truncate">{g.location_label}</span>}
                </div>
                <span className="text-xs text-amber-300 shrink-0">{fmtInt(g.subtotal)} aUEC</span>
              </div>
              <ul>
                {g.items.map((item, ii) => (
                  <li key={ii} className="flex items-center justify-between gap-3 px-4 py-1.5 hover:bg-white/[0.02] transition-colors">
                    <span className="text-sm text-gray-300 truncate">
                      {item.name}
                      {item.qty > 1 && <span className="text-gray-500"> ×{item.qty}</span>}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500 shrink-0">
                      {item.qty > 1
                        ? `${fmtInt(item.unit_price)} ea · ${fmtInt(item.line_total)}`
                        : fmtInt(item.line_total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {lootOnly.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-white/[0.03] flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">Loot only</span>
                <span className="text-[11px] text-gray-500">not sold at any known shop</span>
              </div>
              <ul>
                {lootOnly.map((item, ii) => (
                  <li key={ii} className="px-4 py-1.5 text-sm text-gray-400 truncate hover:bg-white/[0.02] transition-colors">
                    {item.name}
                    {item.qty > 1 && <span className="text-gray-500"> ×{item.qty}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
