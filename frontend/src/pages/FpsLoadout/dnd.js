// Drag-and-drop wiring for the FPS loadout page (@dnd-kit/core).
//
// Drag payloads (draggable `data`):
//   { kind: 'weapon', weapon }        — an Item Source weapon blueprint row
//   { kind: 'build',  build }         — a saved design/build row
//   { kind: 'attachment', attachment }— an attachment row (attachment.slot is
//                                       one of optic/barrel/underbarrel)
//   { kind: 'utility', item }         — a utility-catalog row (item.util_slot
//                                       is medical/gadget/throwable)
//   { kind: 'bench-combo' }           — the bench's current weapon + live
//                                       config (qualities + attachments); the
//                                       container resolves the payload on drop
// Drop targets (droppable `data`):
//   { kind: 'bench' }                 — the whole bench panel: weapons/builds
//                                       dropped here LOAD to the bench (preview
//                                       only, nothing saved)
//   { kind: 'bench-slot', slot }      — a bench attachment zone (optic/…)
//   { kind: 'loadout-slot', slotKey } — a paperdoll slot (primary/…): drops
//                                       here SAVE instantly
//
// ctx (third argument) carries what validation needs:
//   { benchWeapon,                — blueprint currently on the bench
//     slotWeapons: {slotKey: bp} }— saved weapon blueprint per paperdoll slot
import { isCompatible } from './attachmentCompat'

export const WEAPON_SLOT_KEYS = new Set(['primary', 'secondary', 'sidearm'])
export const UTILITY_SLOT_KEYS = new Set(['medical', 'gadget', 'throwable'])

// Which paperdoll/bench targets does the active drag payload fit? Used to
// highlight valid targets while dragging.
export function isValidTarget(drag, target, ctx = {}) {
  if (!drag || !target) return false
  const { benchWeapon = null, slotWeapons = {} } = ctx
  if (target.kind === 'loadout-slot') {
    // Weapons, weapon builds, and the bench combo land on the three weapon slots.
    if (drag.kind === 'weapon' || drag.kind === 'build' || drag.kind === 'bench-combo') {
      return WEAPON_SLOT_KEYS.has(target.slotKey)
    }
    // Utility items land only on the paperdoll slot they belong to.
    if (drag.kind === 'utility') {
      return drag.item?.util_slot != null && drag.item.util_slot === target.slotKey
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
    // Dropping a weapon or build on the bench loads it for tuning (no save).
    return drag.kind === 'weapon' || drag.kind === 'build'
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
    if (drag.kind === 'build') {
      return { type: 'equip-build', slotKey: target.slotKey, build: drag.build }
    }
    if (drag.kind === 'utility') {
      return { type: 'equip-utility', slotKey: target.slotKey, item: drag.item }
    }
    if (drag.kind === 'attachment') {
      return { type: 'equip-attachment-to-slot', slotKey: target.slotKey, attachment: drag.attachment }
    }
    return { type: 'equip-bench-combo', slotKey: target.slotKey }
  }
  if (target.kind === 'bench') {
    return drag.kind === 'weapon'
      ? { type: 'load-bench', weapon: drag.weapon }
      : { type: 'load-bench', build: drag.build }
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
