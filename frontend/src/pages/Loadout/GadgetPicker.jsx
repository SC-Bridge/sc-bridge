import React from 'react'
import { X, Check, Ban } from 'lucide-react'
import { getStrongestMod, MOD_LABELS, formatModPct } from '../Mining/miningUtils'

/**
 * Compact modal for choosing the gadget consumable in one head slot. Mirrors the
 * weapon ComponentPicker interaction (click a row to install) but lightweight —
 * the compatible gadgets are already fetched with the head's slots. Includes a
 * "Leave empty" row to clear the slot.
 */
export default function GadgetPicker({ slotLabel, kind, compatible = [], installedUuid, onSelect, onClose }) {
  const isMining = kind === 'mining'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0c1018] border border-white/10 rounded-xl shadow-2xl shadow-black/50 w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Select {isMining ? 'Mining' : 'Salvage'} Module</h3>
            <p className="text-xs text-gray-500 mt-0.5">{slotLabel} · {compatible.length} compatible</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] rounded-lg transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto min-h-0 p-2 space-y-1">
          {/* Leave empty */}
          <button
            type="button"
            onClick={() => { onSelect(null); onClose() }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors border
              ${!installedUuid ? 'bg-sc-accent/[0.12] border-sc-accent/40' : 'bg-white/[0.01] border-transparent hover:bg-white/[0.05]'}`}
          >
            <Ban className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className={`flex-1 ${!installedUuid ? 'text-gray-200' : 'text-gray-400'}`}>Leave empty</span>
            {!installedUuid && <Check className="w-4 h-4 text-sc-accent" />}
          </button>

          {compatible.map(g => {
            const installed = g.uuid === installedUuid
            const mod = isMining ? getStrongestMod(g) : null
            const dmg = isMining && g.damage_multiplier && Math.abs(g.damage_multiplier - 1) > 0.0001 ? g.damage_multiplier : null
            return (
              <button
                key={g.uuid}
                type="button"
                onClick={() => { onSelect(g); onClose() }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors border
                  ${installed ? 'bg-sc-accent/[0.12] border-sc-accent/40' : 'bg-white/[0.01] border-transparent hover:bg-white/[0.05]'}`}
              >
                {g.size != null && (
                  <span className="text-[10px] font-mono font-bold text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded flex-shrink-0">S{g.size}</span>
                )}
                <span className={`flex-1 truncate ${installed ? 'text-gray-100' : 'text-gray-300'}`}>{g.name}</span>
                {dmg && <span className="text-[11px] text-emerald-400 tabular-nums flex-shrink-0" title="Power multiplier">×{dmg.toFixed(2)}</span>}
                {mod && (
                  <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0" title={MOD_LABELS[mod.key]}>
                    {MOD_LABELS[mod.key]?.split(' ')[0]} {formatModPct(mod.value)}
                  </span>
                )}
                {g.price != null ? (
                  <span className="text-[11px] text-amber-300 tabular-nums flex-shrink-0">{Math.round(g.price).toLocaleString()} aUEC</span>
                ) : (
                  <span className="text-[11px] text-orange-400/70 flex-shrink-0">Loot</span>
                )}
                {installed && <Check className="w-4 h-4 text-sc-accent flex-shrink-0" />}
              </button>
            )
          })}

          {compatible.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">No compatible modules.</div>
          )}
        </div>
      </div>
    </div>
  )
}
