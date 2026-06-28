// frontend/src/pages/FpsLoadout/WeaponBench.jsx
import React, { useMemo, useState } from 'react'
import QualitySlider from '../Crafting/QualitySlider'
import StatsPanel from './StatsPanel'
import { combinedMultipliers, computeBenchStats } from './weaponBenchStats'
import { isCompatible } from './attachmentCompat'
import { resolveWeaponIcon } from './weaponIcon'

export default function WeaponBench({ blueprint, attachments = [] }) {
  const slots = blueprint?.slots || []
  const [qualities, setQualities] = useState(() => Object.fromEntries(slots.map((_, i) => [i, 500])))
  const [equipped, setEquipped] = useState({}) // { [slotType]: attachmentUuid }

  const equippedList = useMemo(
    () => Object.values(equipped).map((uuid) => attachments.find((a) => a.uuid === uuid)).filter(Boolean),
    [equipped, attachments],
  )

  const stats = useMemo(() => {
    if (!blueprint) return null
    const m = combinedMultipliers(slots, qualities, equippedList)
    return computeBenchStats(blueprint.base_stats, m)
  }, [blueprint, slots, qualities, equippedList])

  if (!blueprint) {
    return <div className="text-center py-12 text-gray-500 text-sm">Select a weapon to begin.</div>
  }

  const toggle = (att) => setEquipped((prev) => {
    const next = { ...prev }
    if (next[att.slot] === att.uuid) delete next[att.slot]
    else next[att.slot] = att.uuid
    return next
  })

  const { url } = resolveWeaponIcon(blueprint) // placeholder name lives in the <h3>, so only the url is used here

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {url
          ? <img src={url} alt={blueprint.name} className="w-16 h-10 object-contain" />
          : <span className="w-16 h-10 flex items-center justify-center text-[9px] uppercase tracking-wide text-gray-600 border border-dashed border-white/10 rounded">no icon</span>}
        <h3 className="text-lg font-semibold text-white">{blueprint.name}</h3>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Crafting Materials</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {slots.map((slot, i) => (
            <QualitySlider key={i} slot={slot} value={qualities[i] ?? 500}
              onChange={(v) => setQualities((q) => ({ ...q, [i]: v }))} />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Attachments</h4>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => {
            const ok = isCompatible(blueprint, att)
            const on = equipped[att.slot] === att.uuid
            return (
              <button key={att.uuid} type="button" disabled={!ok} onClick={() => toggle(att)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  on ? 'border-sc-accent/40 text-sc-accent bg-sc-accent/10'
                  : ok ? 'border-white/10 text-gray-400 hover:text-white'
                  : 'border-white/5 text-gray-700 cursor-not-allowed'}`}>
                {att.name}
              </button>
            )
          })}
        </div>
      </div>

      <StatsPanel baseStats={blueprint.base_stats} stats={stats} />
    </div>
  )
}
