// frontend/src/pages/FpsLoadout/ItemBench.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import QualitySlider from '../Crafting/QualitySlider'
import StatsGrid from './StatsGrid'
import ArmourStatsGrid from './ArmourStatsGrid'
import { getBenchAdapter } from './benchAdapters'
import { isCompatible, weaponAttachmentSlots, SLOT_LABEL } from './attachmentCompat'
import { isValidTarget } from './dnd'
import { resolveWeaponIcon } from './weaponIcon'

// A bench attachment slot as a dnd-kit drop target. Highlights when it's a
// valid target for the in-flight drag, and stronger when hovered.
function BenchDropZone({ slot, blueprint, activeDrag, equippedAtt, onToggle }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bench-${slot}`,
    data: { kind: 'bench-slot', slot },
  })
  const valid = isValidTarget(activeDrag, { kind: 'bench-slot', slot }, { benchWeapon: blueprint })
  const border = isOver && valid ? 'border-sc-accent bg-white/10 text-sc-accent'
    : valid ? 'border-sc-accent/60 bg-white/5 text-gray-300'
    : 'border-white/15 text-gray-400'
  return (
    <div ref={setNodeRef} data-testid={`dropzone-${slot}`}
      className={`min-w-[7rem] px-2.5 py-2 text-xs rounded border border-dashed ${border}`}>
      <div className="uppercase tracking-wide text-[9px] text-gray-600">{SLOT_LABEL[slot] || slot}</div>
      {equippedAtt
        ? <button type="button" onClick={() => onToggle(equippedAtt)} className="text-sc-accent">{equippedAtt.name} ✕</button>
        : <span className="text-gray-600">drop here</span>}
    </div>
  )
}

// The bench header doubles as a drag handle for the WHOLE current combo
// (weapon + slider qualities + equipped attachments): drag it onto a paperdoll
// weapon slot to save the custom build into that slot. The container resolves
// the live config on drop, so no payload is carried here beyond the kind.
function BenchComboHandle({ url, displayName }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: 'bench-combo',
    data: { kind: 'bench-combo' },
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid="bench-combo-handle"
      className="flex items-center gap-3 cursor-grab touch-none rounded"
      style={{ opacity: isDragging ? 0.35 : 1 }}
      title="Drag onto a loadout slot to save this build there"
    >
      {url
        ? <img src={url} alt={displayName} className="w-16 h-10 object-contain" />
        : <span className="w-16 h-10 flex items-center justify-center text-[9px] uppercase tracking-wide text-gray-600 border border-dashed border-white/10 rounded">no icon</span>}
      <h3 className="text-lg font-semibold text-white">{displayName}</h3>
      <span className="ml-auto text-[9px] uppercase tracking-wide text-gray-600 select-none">⠿ drag to loadout</span>
    </div>
  )
}

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

export default function ItemBench({ kind = 'weapon', blueprint, attachments = [], initialConfig = null, onConfigChange, equipRequest = null, activeDrag = null }) {
  const adapter = getBenchAdapter(kind)
  const slots = blueprint?.slots || []
  const [qualities, setQualities] = useState(() => qualitiesFromConfig(slots, initialConfig))
  const [equipped, setEquipped] = useState(() => initialConfig?.attachments || {}) // { [slotType]: attachmentUuid }
  // The saved build a loaded config came from — the preview diverges once a slider moves off these.
  const baseline = useRef(initialConfig ? { qualities: qualitiesFromConfig(slots, initialConfig), name: initialConfig.name } : null)
  // Guards against re-firing the same equip request when unrelated props change.
  const equipSeqRef = useRef(0)

  // Reset when the weapon identity changes or a different saved build is loaded.
  useEffect(() => {
    const newSlots = blueprint?.slots || []
    setQualities(qualitiesFromConfig(newSlots, initialConfig))
    setEquipped(initialConfig?.attachments || {})
    baseline.current = initialConfig ? { qualities: qualitiesFromConfig(newSlots, initialConfig), name: initialConfig.name } : null
  }, [blueprint?.name, initialConfig])

  // An attachment was dropped on one of this bench's slots (the DndContext
  // lives in the container; it signals the drop here via a seq-bumped request).
  useEffect(() => {
    if (!adapter.hasAttachments) return
    if (!equipRequest || equipRequest.seq === equipSeqRef.current) return
    equipSeqRef.current = equipRequest.seq
    const att = attachments.find((a) => a.uuid === equipRequest.uuid)
    if (att && att.slot && isCompatible(blueprint, att)) {
      setEquipped((prev) => ({ ...prev, [att.slot]: att.uuid }))
    }
  }, [adapter.hasAttachments, equipRequest, attachments, blueprint])

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
    return adapter.computeStats(blueprint, qualities, equippedList)
  }, [adapter, blueprint, qualities, equippedList])

  if (!blueprint) {
    return <div className="text-center py-12 text-gray-500 text-sm">Select {kind === 'armour' ? 'an armour piece' : 'a weapon'} to begin.</div>
  }

  const toggle = (att) => setEquipped((prev) => {
    const next = { ...prev }
    if (next[att.slot] === att.uuid) delete next[att.slot]
    else next[att.slot] = att.uuid
    return next
  })

  const diverged = baseline.current && !sameQualities(qualities, baseline.current.qualities)

  // Real loadout icon (if extracted) rides on base_stats.loadout_icon; else
  // placeholder text. Armour has no extracted loadout icons yet.
  const { url } = kind === 'weapon' ? resolveWeaponIcon({ ...blueprint, icon_url: blueprint.base_stats?.loadout_icon }) : { url: null }
  // blueprint.name from useCrafting is the raw internal name (e.g. "Behr Lmg Ballistic 01");
  // the friendly, player-facing name lives at base_stats.item_name (e.g. "FS-9 LMG").
  const displayName = blueprint.base_stats?.item_name || blueprint.name

  return (
    <div className="space-y-5">
      <BenchComboHandle url={url} displayName={displayName} />

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

      {adapter.hasAttachments && (() => {
        // The attachment slots THIS weapon exposes (optic/barrel/underbarrel), from
        // its ports — not the union of every attachment's slot. Falls back to the
        // available attachments' slots when the weapon carries no port data.
        const slotNames = weaponAttachmentSlots(blueprint, attachments)
        return slotNames.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Slots</h4>
            <div className="flex flex-wrap gap-2">
              {slotNames.map((slot) => (
                <BenchDropZone key={slot} slot={slot} blueprint={blueprint} activeDrag={activeDrag}
                  equippedAtt={attachments.find((a) => a.uuid === equipped[slot])} onToggle={toggle} />
              ))}
            </div>
          </div>
        )
      })()}

      {kind === 'armour' ? <ArmourStatsGrid baseStats={blueprint.base_stats} stats={stats} /> : <StatsGrid baseStats={blueprint.base_stats} stats={stats} />}
    </div>
  )
}
