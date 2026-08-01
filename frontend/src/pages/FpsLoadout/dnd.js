// Drag-and-drop wiring for the FPS loadout page (@dnd-kit/core).
//
// Drag payloads (draggable `data`):
//   { kind: 'weapon', weapon }        — an Item Source weapon blueprint row
//   { kind: 'armour', armour }        — an Item Source armour blueprint row
//   { kind: 'build',  build }         — a saved design/build row (build.kind
//                                       is 'weapon'|'armour'; armour builds
//                                       carry build.armourSlot)
//   { kind: 'attachment', attachment }— an attachment row (attachment.slot is
//                                       one of optic/barrel/underbarrel)
//   { kind: 'utility', item }         — a utility-catalog row (item.util_slot
//                                       is medical/gadget/throwable/knife)
//   { kind: 'melee', item }           — a knife-catalog row; lands on util_knife only
//   { kind: 'magazine', magazine }    — a magazine-catalog row; lands on mag_*
//   { kind: 'bench-combo' }           — the bench's current weapon/armour +
//                                       live config (qualities + attachments);
//                                       the container resolves the payload on drop
// Drop targets (droppable `data`):
//   { kind: 'bench' }                 — the whole bench panel: weapons/armour/
//                                       builds dropped here LOAD to the bench
//                                       (preview only, nothing saved)
//   { kind: 'bench-slot', slot }      — a bench attachment zone (optic/…)
//   { kind: 'loadout-slot', slotKey } — a paperdoll slot (primary/…): drops
//                                       here SAVE instantly. Utility slots are
//                                       dynamic ordinal keys (grenade_1..4,
//                                       mag_1..8, pen_1..4, util_gadget,
//                                       util_knife) — SLOT_FAMILY maps a key
//                                       to its family + 1-based index.
//
// ctx (third argument) carries what validation needs:
//   { benchWeapon,                — blueprint currently on the bench
//     benchKind,                  — 'weapon'|'armour' — which kind is on the bench
//     slotWeapons: {slotKey: bp}, — saved weapon blueprint per paperdoll slot
//     capacity: {grenades,mags,pens,utilGadget,utilKnife} } — from portCapacity
import { isCompatible } from './attachmentCompat'
import { SLOT_FAMILY } from './portCapacity'

export const WEAPON_SLOT_KEYS = new Set(['primary', 'secondary', 'sidearm'])
export const ARMOUR_SLOT_KEYS = new Set(['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit'])

// A utility item's util_slot -> which capacity family/families it can equip
// into. 'gadget' items (multi-tools etc.) can occupy either the dedicated
// gadget slot or the knife slot — both are general-purpose tool mounts.
const UTIL_SLOT_FAMILIES = {
  throwable: ['grenades'],
  medical: ['pens'],
  gadget: ['utilGadget', 'utilKnife'],
  knife: ['utilKnife'],
}

// Which paperdoll/bench targets does the active drag payload fit? Used to
// highlight valid targets while dragging.
export function isValidTarget(drag, target, ctx = {}) {
  if (!drag || !target) return false
  const { benchWeapon = null, slotWeapons = {}, capacity = {} } = ctx
  if (target.kind === 'loadout-slot') {
    const { family, index } = SLOT_FAMILY(target.slotKey)
    const withinCapacity = (fam) => fam != null && index <= (capacity[fam] || 0)
    if (drag.kind === 'weapon' || drag.kind === 'bench-combo') {
      if (drag.kind === 'bench-combo' && ctx.benchKind === 'armour') {
        const slot = ctx.benchWeapon?.base_stats?.armour_slot
        return slot != null && slot === target.slotKey
      }
      return WEAPON_SLOT_KEYS.has(target.slotKey)
    }
    if (drag.kind === 'build') {
      // Armour builds land on their piece's slot; weapon builds on weapon slots.
      if (drag.build?.kind === 'armour') {
        return drag.build?.armourSlot != null && drag.build.armourSlot === target.slotKey
      }
      return WEAPON_SLOT_KEYS.has(target.slotKey)
    }
    if (drag.kind === 'armour') {
      const slot = drag.armour?.base_stats?.armour_slot
      return slot != null && slot === target.slotKey
    }
    // Utility items land on any capacity family their util_slot maps to,
    // within that family's current capacity.
    if (drag.kind === 'utility') {
      const families = UTIL_SLOT_FAMILIES[drag.item?.util_slot]
      return Boolean(families) && families.includes(family) && withinCapacity(family)
    }
    // Knives land only on the dedicated knife slot.
    if (drag.kind === 'melee') {
      return family === 'utilKnife' && withinCapacity(family)
    }
    // Magazines land only on mag_* slots, within capacity.
    if (drag.kind === 'magazine') {
      return family === 'mags' && withinCapacity(family)
    }
    // An attachment dropped on a FILLED weapon tile stores it into that
    // slot's saved config — valid only if it fits that slot's weapon.
    if (drag.kind === 'attachment') {
      const slotWeapon = slotWeapons[target.slotKey]
      return Boolean(slotWeapon) && drag.attachment?.slot != null
        && isCompatible(slotWeapon, drag.attachment)
    }
    return false
  }
  if (target.kind === 'bench') {
    // Dropping a weapon, armour piece, or build on the bench loads it for tuning (no save).
    return drag.kind === 'weapon' || drag.kind === 'build' || drag.kind === 'armour'
  }
  if (target.kind === 'bench-slot') {
    return (
      drag.kind === 'attachment' &&
      drag.attachment?.slot === target.slot &&
      isCompatible(benchWeapon, drag.attachment)
    )
  }
  return false
}

// Translate a completed drag into an action for the container to dispatch.
// Returns null when the drop isn't a valid combination.
export function resolveDrop(drag, target, ctx = {}) {
  if (!isValidTarget(drag, target, ctx)) return null
  if (target.kind === 'loadout-slot') {
    if (drag.kind === 'weapon') {
      return { type: 'equip-weapon', slotKey: target.slotKey, weapon: drag.weapon }
    }
    if (drag.kind === 'armour') {
      return { type: 'equip-armour', slotKey: target.slotKey, armour: drag.armour }
    }
    if (drag.kind === 'build') {
      return { type: 'equip-build', slotKey: target.slotKey, build: drag.build }
    }
    if (drag.kind === 'utility') {
      return { type: 'equip-utility', slotKey: target.slotKey, item: drag.item }
    }
    if (drag.kind === 'melee') {
      return { type: 'equip-melee', slotKey: target.slotKey, item: drag.item }
    }
    if (drag.kind === 'magazine') {
      return { type: 'equip-magazine', slotKey: target.slotKey, magazine: drag.magazine }
    }
    if (drag.kind === 'attachment') {
      return { type: 'equip-attachment-to-slot', slotKey: target.slotKey, attachment: drag.attachment }
    }
    return { type: 'equip-bench-combo', slotKey: target.slotKey }
  }
  if (target.kind === 'bench') {
    if (drag.kind === 'weapon') return { type: 'load-bench', weapon: drag.weapon }
    if (drag.kind === 'armour') return { type: 'load-bench', armour: drag.armour }
    return { type: 'load-bench', build: drag.build }
  }
  // bench-slot + attachment (the only other valid combination)
  return { type: 'equip-attachment', attachment: drag.attachment }
}

// Given a completed drag event, pick the first collision that resolves to a
// valid action. Droppables nest (bench-slot zones sit inside the bench panel;
// several tiles can overlap the drag rect), and dnd-kit's `over` is just the
// top collision — which may be an invalid combination while a valid one is
// right underneath.
export function resolveDropFromCollisions(drag, collisions, ctx = {}) {
  for (const collision of collisions || []) {
    const target = collision?.data?.droppableContainer?.data?.current
    const action = resolveDrop(drag, target, ctx)
    if (action) return action
  }
  return null
}

// Merge an attachment into a slot's saved config (immutably) — used when an
// attachment is dropped straight onto a filled paperdoll weapon tile.
export function mergeAttachmentIntoConfig(config, attachment) {
  const base = config || {}
  return {
    ...base,
    qualities: base.qualities || {},
    attachments: { ...(base.attachments || {}), [attachment.slot]: attachment.uuid },
  }
}
