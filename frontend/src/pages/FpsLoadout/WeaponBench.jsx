// frontend/src/pages/FpsLoadout/WeaponBench.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import QualitySlider from '../Crafting/QualitySlider'
import StatsGrid from './StatsGrid'
import { combinedMultipliers, computeBenchStats } from './weaponBenchStats'
import { isCompatible, weaponAttachmentSlots, SLOT_LABEL } from './attachmentCompat'
import { resolveWeaponIcon } from './weaponIcon'

const defaultQ = (slots) => Object.fromEntries((slots || []).map((_, i) => [i, 500]))

function qualitiesFromConfig(slots, config) {
  const q = defaultQ(slots)
  if (config?.qualities) for (const [k, v] of Object.entries(config.qualities)) q[Number(k)] = Number(v)
  return q
}

function sameQualities(a, b) {
  const ka = Object.keys(a || {})
  const kb = Object.keys(b || {})
  if (ka.length !== kb.length) return false
  return ka.every((k) => Number(a[k]) === Number((b || {})[k]))
}

export default function WeaponBench({ blueprint, attachments = [], initialConfig = null, onConfigChange }) {
  const slots = blueprint?.slots || []
  const [qualities, setQualities] = useState(() => qualitiesFromConfig(slots, initialConfig))
  const [equipped, setEquipped] = useState(() => initialConfig?.attachments || {}) // { [slotType]: attachmentUuid }
  const [dragSlot, setDragSlot] = useState(null) // slot currently under a drag, for hover feedback
  // The saved build a loaded config came from — the preview diverges once a slider moves off these.
  const baseline = useRef(initialConfig ? { qualities: qualitiesFromConfig(slots, initialConfig), name: initialConfig.name } : null)

  // Reset when the weapon identity changes or a different saved build is loaded.
  useEffect(() => {
    const newSlots = blueprint?.slots || []
    setQualities(qualitiesFromConfig(newSlots, initialConfig))
    setEquipped(initialConfig?.attachments || {})
    baseline.current = initialConfig ? { qualities: qualitiesFromConfig(newSlots, initialConfig), name: initialConfig.name } : null
  }, [blueprint?.name, initialConfig])

  // Surface the live config so a parent can save it.
  useEffect(() => {
    if (onConfigChange) onConfigChange({ qualities, attachments: equipped })
  }, [qualities, equipped, onConfigChange])

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

  const dropOnSlot = (slot, uuid) => {
    const att = attachments.find((a) => a.uuid === uuid)
    if (att && att.slot === slot && isCompatible(blueprint, att)) {
      setEquipped((prev) => ({ ...prev, [slot]: uuid }))
    }
  }

  // The attachment slots THIS weapon exposes (optic/barrel/underbarrel), from
  // its ports — not the union of every attachment's slot. Falls back to the
  // available attachments' slots when the weapon carries no port data.
  const slotNames = weaponAttachmentSlots(blueprint, attachments)
  const diverged = baseline.current && !sameQualities(qualities, baseline.current.qualities)

  // Real loadout icon (if extracted) rides on base_stats.loadout_icon; else placeholder text.
  const { url } = resolveWeaponIcon({ ...blueprint, icon_url: blueprint.base_stats?.loadout_icon })
  // blueprint.name from useCrafting is the raw internal name (e.g. "Behr Lmg Ballistic 01");
  // the friendly, player-facing name lives at base_stats.item_name (e.g. "FS-9 LMG").
  const displayName = blueprint.base_stats?.item_name || blueprint.name

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {url
          ? <img src={url} alt={displayName} className="w-16 h-10 object-contain" />
          : <span className="w-16 h-10 flex items-center justify-center text-[9px] uppercase tracking-wide text-gray-600 border border-dashed border-white/10 rounded">no icon</span>}
        <h3 className="text-lg font-semibold text-white">{displayName}</h3>
      </div>

      {diverged && (
        <div className="text-xs rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2">
          Preview only — these stats no longer match your saved weapon &ldquo;{baseline.current.name}&rdquo;.
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Crafting Materials</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {slots.map((slot, i) => (
            <QualitySlider key={i} slot={slot} value={qualities[i] ?? 500}
              onChange={(v) => setQualities((q) => ({ ...q, [i]: v }))} />
          ))}
        </div>
      </div>

      {slotNames.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Slots</h4>
          <div className="flex flex-wrap gap-2">
            {slotNames.map((slot) => {
              const equippedAtt = attachments.find((a) => a.uuid === equipped[slot])
              return (
                <div key={slot} data-testid={`dropzone-${slot}`}
                  onDragEnter={(e) => { e.preventDefault(); setDragSlot(slot) }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                  onDragLeave={() => setDragSlot((s) => (s === slot ? null : s))}
                  onDrop={(e) => { e.preventDefault(); setDragSlot(null); dropOnSlot(slot, e.dataTransfer.getData('text/plain')) }}
                  className={`min-w-[7rem] px-2.5 py-2 text-xs rounded border border-dashed ${dragSlot === slot ? 'border-sc-accent bg-white/5 text-sc-accent' : 'border-white/15 text-gray-400'}`}>
                  <div className="uppercase tracking-wide text-[9px] text-gray-600">{SLOT_LABEL[slot] || slot}</div>
                  {equippedAtt
                    ? <button type="button" onClick={() => toggle(equippedAtt)} className="text-sc-accent">{equippedAtt.name} ✕</button>
                    : <span className="text-gray-600">drop here</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <StatsGrid baseStats={blueprint.base_stats} stats={stats} />
    </div>
  )
}
