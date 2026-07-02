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
//   { kind: 'bench-slot', slot }      — a bench attachment zone (optic/…)
//   { kind: 'loadout-slot', slotKey } — a paperdoll slot (primary/…)
import { isCompatible } from './attachmentCompat'

export const WEAPON_SLOT_KEYS = new Set(['primary', 'secondary', 'sidearm'])
export const UTILITY_SLOT_KEYS = new Set(['medical', 'gadget', 'throwable'])

// Which paperdoll/bench targets does the active drag payload fit? Used to
// highlight valid targets while dragging.
export function isValidTarget(drag, target, benchWeapon) {
  if (!drag || !target) return false
  if (target.kind === 'loadout-slot') {
    // Weapons, weapon builds, and the bench combo land on the three weapon slots.
    if (drag.kind === 'weapon' || drag.kind === 'build' || drag.kind === 'bench-combo') {
      return WEAPON_SLOT_KEYS.has(target.slotKey)
    }
    // Utility items land only on the paperdoll slot they belong to.
    if (drag.kind === 'utility') {
      return drag.item?.util_slot != null && drag.item.util_slot === target.slotKey
    }
    return false
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
export function resolveDrop(drag, target, benchWeapon) {
  if (!isValidTarget(drag, target, benchWeapon)) return null
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
    return { type: 'equip-bench-combo', slotKey: target.slotKey }
  }
  // bench-slot + attachment (the only other valid combination)
  return { type: 'equip-attachment', attachment: drag.attachment }
}
