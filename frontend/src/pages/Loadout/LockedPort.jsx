import React from 'react'
import { Lock } from 'lucide-react'
import { SlotThumb } from './loadoutHelpers'

/**
 * LockedPort — renders a non-editable port with a lock icon.
 * "Locked" means the player cannot swap this component — it's NOT the same as
 * "fixed mount" (a non-gimballed weapon). Door guns are locked but gimballed.
 */
function humanizePortName(portName) {
  if (!portName) return 'Locked'
  // Strip hardpoint_ prefix, replace underscores with spaces, title-case
  return portName
    .replace(/^hardpoint_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function LockedPort({ item }) {
  const name = item.child_name || item.component_name || item.mount_name || humanizePortName(item.port_name)

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.03] opacity-60">
      <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-500">
        S{item.component_size || item.size_max}
      </span>
      <SlotThumb item={item} title={name} />
      <span className="text-sm text-gray-400">{name}</span>
      {item.manufacturer_name && <span className="text-[11px] text-gray-600">{item.manufacturer_name}</span>}
      <span className="flex items-center gap-1 text-[11px] text-gray-600 ml-auto" title="This component cannot be changed">
        <Lock className="w-3 h-3" /> locked
      </span>
    </div>
  )
}
