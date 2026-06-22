import React from 'react'
import { Gem, Recycle, Check } from 'lucide-react'
import { useHeadGadgets } from '../../hooks/useAPI'
import { computeEffectiveModifiers, MOD_KEYS, MOD_LABELS, MOD_POSITIVE_IS_GOOD, formatModPct } from '../Mining/miningUtils'

/**
 * Gadget consumable slots for ONE equipped tool head (mining laser / salvage
 * head). Fetches the head's slots + compatible gadgets, renders a picker per
 * slot, and (for mining) shows the combined effect of the chosen modules.
 *
 * Persistence key per slot is '<headPortName>#<slotIndex>'. `selections` maps
 * that key → { module_uuid }. onSelect(slotKey, gadget|null, kind) installs or
 * clears (null = empty). Read-only when onSelect is omitted.
 */
export default function GadgetModulesSection({ head, selections, onSelect }) {
  const { data } = useHeadGadgets(head?.uuid)
  const editable = typeof onSelect === 'function'

  if (!data || !data.slots?.length) return null
  const kind = data.kind // 'mining' | 'salvage'
  const Icon = kind === 'salvage' ? Recycle : Gem
  const accent = kind === 'salvage' ? 'text-cyan-400' : 'text-amber-400'

  const slotKeyFor = (slot) => `${head.port_name}#${slot.slot_index}`

  // Resolve the gadget chosen in each slot (for the combined-effect summary).
  const chosenGadgets = []
  for (const slot of data.slots) {
    const sel = selections?.[slotKeyFor(slot)]
    if (sel) {
      const g = slot.compatible.find((c) => c.uuid === sel)
      if (g) chosenGadgets.push(g)
    }
  }

  // Combined modifier effect of the chosen mining modules (additive stacking).
  const effective = kind === 'mining' ? computeEffectiveModifiers(null, chosenGadgets, null) : null
  const activeMods = effective ? MOD_KEYS.filter((k) => Math.abs(effective[k] || 0) > 0.0001) : []
  const dmgMult = kind === 'mining'
    ? chosenGadgets.reduce((p, g) => p * (g.damage_multiplier || 1), 1)
    : 1

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
        <Icon className={`w-4 h-4 ${accent}`} />
        <span className="text-[12px] font-semibold uppercase tracking-wider font-hud text-gray-300">
          {head.name || data.head_name || 'Head'} — {kind === 'salvage' ? 'Salvage Modules' : 'Mining Modules'}
        </span>
        <span className="text-[11px] text-gray-600">{data.slots.length === 1 ? '1 slot' : `${data.slots.length} slots`}</span>
        {editable && <span className="text-[10px] text-gray-600 ml-auto">Click to install</span>}
      </div>

      <div className="divide-y divide-white/[0.04]">
        {data.slots.map((slot) => {
          const slotKey = slotKeyFor(slot)
          const installedUuid = selections?.[slotKey] || null
          return (
            <div key={slot.slot_index} className="px-3 py-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 font-hud">
                Slot {slot.slot_index + 1}
              </div>
              <div className="space-y-1">
                {editable && (
                  <button
                    type="button"
                    onClick={() => onSelect(slotKey, null, kind)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors
                      ${!installedUuid ? 'bg-white/[0.03] border border-white/[0.08]' : 'bg-white/[0.01] border border-transparent hover:bg-white/[0.06] cursor-pointer'}`}
                  >
                    <span className={`flex-1 ${!installedUuid ? 'text-gray-200' : 'text-gray-500'}`}>Empty</span>
                    {!installedUuid && (
                      <span className="text-[9px] text-sc-accent uppercase tracking-wider font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Installed
                      </span>
                    )}
                  </button>
                )}
                {slot.compatible.map((g) => {
                  const installed = g.uuid === installedUuid
                  const Row = editable ? 'button' : 'div'
                  return (
                    <Row
                      key={g.uuid}
                      {...(editable ? { type: 'button', onClick: () => onSelect(slotKey, g, kind === 'salvage' ? 'salvage_gadget' : 'mining_gadget') } : {})}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors
                        ${installed ? 'bg-sc-accent/10 border border-sc-accent/40' : 'bg-white/[0.01] border border-transparent'}
                        ${editable ? 'hover:bg-white/[0.06] cursor-pointer' : ''}`}
                    >
                      <span className={`flex-1 ${installed ? 'text-gray-200' : 'text-gray-400'}`}>{g.name}</span>
                      {g.price != null ? (
                        <span className="text-[11px] text-amber-300 flex-shrink-0 tabular-nums">{Math.round(g.price).toLocaleString()} aUEC</span>
                      ) : (
                        <span className="text-[11px] text-gray-600 flex-shrink-0">—</span>
                      )}
                      {installed && (
                        <span className="text-[9px] text-sc-accent uppercase tracking-wider font-semibold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Installed
                        </span>
                      )}
                    </Row>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Combined effect of the chosen mining modules */}
      {kind === 'mining' && (activeMods.length > 0 || Math.abs(dmgMult - 1) > 0.0001) && (
        <div className="px-3 py-2 border-t border-white/[0.06] bg-white/[0.01]">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 font-hud">Combined Effect</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Math.abs(dmgMult - 1) > 0.0001 && (
              <span className="text-[12px] tabular-nums">
                <span className="text-gray-500">Power </span>
                <span className={dmgMult >= 1 ? 'text-emerald-400' : 'text-red-400'}>×{dmgMult.toFixed(2)}</span>
              </span>
            )}
            {activeMods.map((k) => {
              const val = effective[k]
              const good = MOD_POSITIVE_IS_GOOD[k] ? val > 0 : val < 0
              return (
                <span key={k} className="text-[12px] tabular-nums">
                  <span className="text-gray-500">{MOD_LABELS[k]} </span>
                  <span className={good ? 'text-emerald-400' : 'text-red-400'}>{formatModPct(val)}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
