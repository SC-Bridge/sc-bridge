import React from 'react'
import { Package } from 'lucide-react'
import { totalCargo, maxCargo } from '../lib/moduleCargo'

/** Loadout header stat: cargo with the currently equipped modules. */
export function CargoInline({ hull, modules, selections }) {
  const total = totalCargo(hull, modules, selections)
  if (total == null) return null
  return (
    <span>
      Cargo <span className="text-gray-300" data-testid="cargo-total">{total.toLocaleString()}</span> SCU
    </span>
  )
}

/**
 * Ship page storage tile: cargo as the ship comes (default modules), with the
 * ceiling its modules can reach. A modular hull with no grid of its own shows a
 * dash for the stock figure.
 */
export function CargoTile({ hull, modules }) {
  const stock = totalCargo(hull, modules, undefined)
  const max = maxCargo(hull, modules)
  if (stock == null && max == null) return null
  const moduleNote = max != null && max > (stock || 0)
  return (
    <div className="flex items-center gap-3">
      <div className="p-2.5 rounded-lg bg-sc-highlight/10 text-sc-highlight">
        <Package className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-mono font-semibold text-white">
          <span data-testid="cargo-total">{stock != null ? stock.toLocaleString() : '—'}</span>
          {stock != null && <span className="text-sm text-gray-400"> SCU</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Cargo grid{moduleNote && ` · up to ${max.toLocaleString()} SCU with modules`}
        </p>
      </div>
    </div>
  )
}
