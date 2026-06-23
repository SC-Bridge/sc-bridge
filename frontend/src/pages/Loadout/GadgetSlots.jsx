import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { useHeadGadgets } from '../../hooks/useAPI'
import { computeEffectiveModifiers, MOD_KEYS, MOD_LABELS, MOD_POSITIVE_IS_GOOD, formatModPct } from '../Mining/miningUtils'
import GadgetPicker from './GadgetPicker'

/** └ bracket connector for parent→child rows (matches WeaponBlock). */
function Bracket() {
  return (
    <svg className="flex-shrink-0 w-3.5 h-[16px] -ml-3.5 mr-0" style={{ color: 'rgba(255,255,255,0.15)' }}
      viewBox="0 0 14 16" fill="none">
      <path d="M 2 0 L 2 9 Q 2 13 6 13 L 14 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Gadget consumable slots for one equipped tool head (mining laser / salvage
 * head), rendered inline as indented child rows beneath the head — like the
 * weapon mount→child rows. Empty by default; clicking a slot opens a picker to
 * choose a module. `selections` maps the composite slot key '<portName>#<index>'
 * → uuid. Read-only when `onSelect` is omitted.
 */
export default function GadgetSlots({ headUuid, portName, selections, onSelect }) {
  const { data } = useHeadGadgets(headUuid)
  const [openSlot, setOpenSlot] = useState(null) // slot object or null
  const editable = typeof onSelect === 'function'

  if (!data || !data.slots?.length) return null
  const kind = data.kind

  const slotKeyFor = (slot) => `${portName}#${slot.slot_index}`

  // Chosen gadgets across this head's slots (for the combined-effect hint).
  const chosen = []
  for (const slot of data.slots) {
    const sel = selections?.[slotKeyFor(slot)]
    if (sel) {
      const g = slot.compatible.find(c => c.uuid === sel)
      if (g) chosen.push(g)
    }
  }
  const effective = kind === 'mining' && chosen.length ? computeEffectiveModifiers(null, chosen, null) : null
  const activeMods = effective ? MOD_KEYS.filter(k => Math.abs(effective[k] || 0) > 0.0001) : []
  const dmgMult = kind === 'mining' ? chosen.reduce((p, g) => p * (g.damage_multiplier || 1), 1) : 1

  return (
    <div className="pb-1.5 -mt-0.5">
      {data.slots.map(slot => {
        const slotKey = slotKeyFor(slot)
        const installedUuid = selections?.[slotKey] || null
        const installed = installedUuid ? slot.compatible.find(c => c.uuid === installedUuid) : null
        const Row = editable ? 'button' : 'div'
        return (
          <Row
            key={slot.slot_index}
            {...(editable ? { type: 'button', onClick: () => setOpenSlot(slot) } : {})}
            className={`w-full flex items-center gap-1.5 py-0.5 px-1 leading-tight text-left rounded transition-colors
              ${editable ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
            style={{ marginLeft: '44px' }}
          >
            <Bracket />
            <span className="text-[11px] w-6 text-center flex-shrink-0 font-mono bg-white/[0.04] border border-white/[0.08] rounded px-1 py-px text-gray-500">
              S{slot.max_size}
            </span>
            {installed ? (
              <>
                <span className="text-[13px] text-gray-300 truncate">{installed.name}</span>
                {installed.price != null && (
                  <span className="text-[11px] text-amber-300/80 tabular-nums ml-auto flex-shrink-0">{Math.round(installed.price).toLocaleString()} aUEC</span>
                )}
              </>
            ) : (
              <span className="text-[12px] text-gray-600 flex items-center gap-1">
                {editable && <Plus className="w-3 h-3" />}
                {kind === 'salvage' ? 'Empty salvage slot' : 'Empty module slot'}
              </span>
            )}
          </Row>
        )
      })}

      {/* Combined effect — one compact line, only when modules are installed */}
      {kind === 'mining' && (activeMods.length > 0 || Math.abs(dmgMult - 1) > 0.0001) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px]" style={{ marginLeft: '64px' }}>
          {Math.abs(dmgMult - 1) > 0.0001 && (
            <span className="tabular-nums"><span className="text-gray-600">Power </span><span className={dmgMult >= 1 ? 'text-emerald-400' : 'text-red-400'}>×{dmgMult.toFixed(2)}</span></span>
          )}
          {activeMods.map(k => {
            const val = effective[k]
            const good = MOD_POSITIVE_IS_GOOD[k] ? val > 0 : val < 0
            return (
              <span key={k} className="tabular-nums"><span className="text-gray-600">{MOD_LABELS[k]} </span><span className={good ? 'text-emerald-400' : 'text-red-400'}>{formatModPct(val)}</span></span>
            )
          })}
        </div>
      )}

      {openSlot && (
        <GadgetPicker
          slotLabel={`${data.head_name || 'Head'} · Slot ${openSlot.slot_index + 1}`}
          kind={kind}
          compatible={openSlot.compatible}
          installedUuid={selections?.[slotKeyFor(openSlot)] || null}
          onSelect={(g) => onSelect(slotKeyFor(openSlot), g, kind === 'salvage' ? 'salvage_gadget' : 'mining_gadget')}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  )
}
