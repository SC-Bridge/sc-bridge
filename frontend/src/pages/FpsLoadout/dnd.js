// Drag-and-drop wiring for the FPS loadout page (@dnd-kit/core).
//
// Drag payloads (draggable `data`):
//   { kind: 'weapon', weapon }        — an Item Source weapon blueprint row
//   { kind: 'build',  build }         — a saved design/build row
//   { kind: 'attachment', attachment }— an attachment row (attachment.slot is
//                                       one of optic/barrel/underbarrel)
// Drop targets (droppable `data`):
//   { kind: 'bench-slot', slot }      — a bench attachment zone (optic/…)
//   { kind: 'loadout-slot', slotKey } — a paperdoll slot (primary/…)
import { isCompatible } from './attachmentCompat'

export const WEAPON_SLOT_KEYS = new Set(['primary', 'secondary', 'sidearm'])

// Which paperdoll/bench targets does the active drag payload fit? Used to
// highlight valid targets while dragging.
export function isValidTarget(drag, target, benchWeapon) {
  if (!drag || !target) return false
  if (target.kind === 'loadout-slot') {
    // Weapons and weapon builds land on the three weapon slots.
    return (drag.kind === 'weapon' || drag.kind === 'build') && WEAPON_SLOT_KEYS.has(target.slotKey)
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
    return { type: 'equip-build', slotKey: target.slotKey, build: drag.build }
  }
  // bench-slot + attachment (the only other valid combination)
  return { type: 'equip-attachment', attachment: drag.attachment }
}
