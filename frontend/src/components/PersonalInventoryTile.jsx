import React from 'react'
import { Box } from 'lucide-react'

/**
 * Ship page storage tile: the ship's personal inventory capacity.
 * `scu` is vehicles.vehicle_inventory, which the pipeline already stores in SCU.
 */
export default function PersonalInventoryTile({ scu }) {
  if (scu == null || !(scu > 0)) return null
  return (
    <div className="flex items-center gap-3">
      <div className="p-2.5 rounded-lg bg-sc-accent2/10 text-sc-accent2">
        <Box className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-mono font-semibold text-white">
          <span data-testid="personal-inventory">{scu.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>{' '}
          <span className="text-sm text-gray-400">SCU</span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">Personal inventory</p>
      </div>
    </div>
  )
}
