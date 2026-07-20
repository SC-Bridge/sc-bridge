import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { isValidTarget } from './dnd'

const ICON = (name) => `/inventory-assets/${name}`

// Palette lifted from the FPS loadout visual system (see index.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const OWN = '#36e08a'
const WANT = '#f3b03a'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'
const PANEL2 = '#0e1822'

// CSS filters to tint dark SVG icons — matches Ico() in index.jsx.
const ICO_FILTER_ACTIVE = 'brightness(0) saturate(100%) invert(85%) sepia(30%) saturate(1000%) hue-rotate(155deg) brightness(1.1) drop-shadow(0 0 3px rgba(0,232,255,0.6))'
const ICO_FILTER_DIM = 'brightness(0) saturate(100%) invert(60%) sepia(20%) saturate(500%) hue-rotate(155deg) brightness(0.7)'

const SLOT_GROUPS = [
  { label: 'Weapons', slots: ['primary', 'secondary', 'sidearm'] },
  { label: 'Armour', slots: ['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit'] },
  { label: 'Utility', slots: ['medical', 'gadget', 'throwable'] },
]

const WEAPON_SLOTS = new Set(SLOT_GROUPS[0].slots)
const UTILITY_SLOTS = new Set(SLOT_GROUPS[2].slots)

const SLOT_ICON = {
  primary: 'icon_common_primary_weapon',
  secondary: 'icon_common_secondary_weapon',
  sidearm: 'icon_common_sidearm',
  helmet: 'icon_common_helmet',
  core: 'PIT_Looting_Core_Icon',
  arms: 'icon_common_arms',
  legs: 'PIT_Looting_Legs_Icon',
  backpack: 'icon_common_backpack_small',
  undersuit: 'icon_common_under_suit',
  medical: 'icon_common_consumable',
  gadget: 'icon_common_gadgets',
  throwable: 'icon_common_grenade',
}

const SLOT_LABEL = {
  primary: 'Primary',
  secondary: 'Secondary',
  sidearm: 'Sidearm',
  helmet: 'Helmet',
  core: 'Core',
  arms: 'Arms',
  legs: 'Legs',
  backpack: 'Backpack',
  undersuit: 'Undersuit',
  medical: 'Medical',
  gadget: 'Gadget',
  throwable: 'Throwable',
}

const ATTACHMENT_PIPS = [
  { key: 'barrel', icon: 'icon_common_weapon_attachment_barrel' },
  { key: 'optic', icon: 'icon_common_weapon_attachment_scope' },
  { key: 'underbarrel', icon: 'icon_common_weapon_attachment_underbarrel' },
]

function GroupLabel({ children }) {
  return (
    <div
      className="flex items-center gap-2 uppercase mb-1.5 mt-2.5 first:mt-0.5"
      style={{ fontSize: 10, letterSpacing: '2px', color: CYAN_DIM }}
    >
      {children}
      <span className="flex-1 h-px" style={{ background: `repeating-linear-gradient(90deg, ${LINE2} 0 4px, transparent 4px 8px)` }} />
    </div>
  )
}

function AttachmentPips({ slotKey, attachments }) {
  const atts = attachments || {}
  return (
    <div className="flex gap-1 mt-0.5" data-testid={`atts-${slotKey}`}>
      {ATTACHMENT_PIPS.map(({ key, icon }) => {
        const lit = Boolean(atts[key])
        return (
          <span
            key={key}
            data-testid={`pip-${slotKey}-${key}`}
            data-lit={lit ? 'true' : 'false'}
            className="flex items-center justify-center rounded-sm"
            style={{
              width: 15,
              height: 15,
              border: `1px solid ${lit ? CYAN : LINE2}`,
              background: lit ? 'rgba(0,232,255,0.12)' : 'transparent',
            }}
            title={key}
          >
            <img
              src={ICON(`${icon}.svg`)}
              alt=""
              style={{ width: 10, height: 10, filter: lit ? ICO_FILTER_ACTIVE : ICO_FILTER_DIM, opacity: lit ? 1 : 0.5 }}
            />
          </span>
        )
      })}
    </div>
  )
}

function SlotBadge({ owned, wishlisted }) {
  if (owned) {
    return (
      <span
        className="absolute top-1 right-1.5 font-bold"
        style={{ fontSize: 12, color: OWN }}
        aria-label="owned"
        title="Owned"
      >
        &#10003;
      </span>
    )
  }
  if (wishlisted) {
    return (
      <span
        className="absolute top-1 right-1.5 font-bold"
        style={{ fontSize: 12, color: WANT }}
        aria-label="aspirational"
        title="Aspirational"
      >
        &#9671;
      </span>
    )
  }
  return null
}

function SlotTile({ slotKey, entry, selected, inert, onSelectSlot, activeDrag, dropCtx }) {
  const isWeapon = WEAPON_SLOTS.has(slotKey)
  const filled = Boolean(entry && entry.item_name)
  const owned = filled && Boolean(entry.owned)
  const wishlisted = filled && !owned && Boolean(entry.wishlisted)

  // Weapon + utility tiles double as dnd-kit drop targets for items dragged
  // from Item Source (drop = equip + save immediately). Armour stays inert
  // until slice 2.
  const isUtility = UTILITY_SLOTS.has(slotKey)
  const { setNodeRef, isOver } = useDroppable({
    id: `loadout-${slotKey}`,
    data: { kind: 'loadout-slot', slotKey },
    disabled: !isWeapon && !isUtility,
  })
  const validTarget = isValidTarget(activeDrag, { kind: 'loadout-slot', slotKey }, dropCtx)

  const nameColor = filled ? (owned ? OWN : wishlisted ? WANT : '#eafcff') : ICE_DIM

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`slot-${slotKey}`}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelectSlot(slotKey)}
      aria-pressed={selected}
      className="relative flex flex-col items-center justify-center gap-1 rounded cursor-pointer text-left"
      style={{
        height: 92,
        padding: '6px 6px',
        background: isOver && validTarget ? 'rgba(0,232,255,0.10)' : PANEL2,
        border: `1px solid ${isOver && validTarget ? CYAN : validTarget ? 'rgba(0,232,255,0.55)' : selected ? CYAN : filled ? LINE2 : LINE}`,
        borderStyle: filled && !validTarget ? 'solid' : 'dashed',
        boxShadow: isOver && validTarget ? '0 0 0 1px rgba(0,232,255,0.45), 0 0 20px rgba(0,232,255,0.28)'
          : selected ? '0 0 0 1px rgba(0,232,255,0.25), 0 0 16px rgba(0,232,255,0.14)' : 'none',
        opacity: inert && !selected && !validTarget ? 0.55 : 1,
      }}
    >
      <SlotBadge owned={owned} wishlisted={wishlisted} />
      <img
        src={ICON(`${SLOT_ICON[slotKey]}.svg`)}
        alt=""
        style={{
          width: 30,
          height: 30,
          filter: selected || owned ? ICO_FILTER_ACTIVE : ICO_FILTER_DIM,
          opacity: filled ? 1 : 0.5,
        }}
      />
      <div
        className="text-center leading-tight"
        style={{ fontSize: 11, color: nameColor }}
      >
        {filled ? entry.item_name : SLOT_LABEL[slotKey]}
      </div>
      <div
        className="uppercase text-center"
        style={{ fontSize: 8.5, letterSpacing: '1px', color: ICE_DIM }}
      >
        {slotKey}
      </div>
      {isWeapon && <AttachmentPips slotKey={slotKey} attachments={entry?.config?.attachments} />}
    </button>
  )
}

export default function MyLoadout({ loadout, selectedSlot, onSelectSlot, activeDrag = null, dropCtx = undefined }) {
  const bySlot = {}
  for (const s of loadout?.slots || []) {
    bySlot[s.slot_key] = s
  }

  return (
    <div>
      {SLOT_GROUPS.map((group, i) => (
        <div key={group.label}>
          <GroupLabel>{group.label}</GroupLabel>
          <div className="grid grid-cols-3 gap-2">
            {group.slots.map((slotKey) => (
              <SlotTile
                key={slotKey}
                slotKey={slotKey}
                entry={bySlot[slotKey]}
                selected={selectedSlot === slotKey}
                inert={i !== 0}
                onSelectSlot={onSelectSlot}
                activeDrag={activeDrag}
                dropCtx={dropCtx}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
