// Paint helpers for the ship page and the Loadout paint picker.
//
// Every hull has one default paint (paint_vehicles.is_default_for_vehicle,
// surfaced as `is_default` by /api/paints/ship/:slug): either a synthetic
// "Standard" livery (`is_standard`, migration 0289, no image of its own) or,
// on a special edition, the edition's own livery. A fleet entry with nothing
// equipped (equipped_paint_id NULL) is wearing that default.

/** Thumbnail for a paint; a Standard livery has no image, so it shows the ship. */
export function paintThumb(paint, shipImage) {
  const own = paint.image_url_small || paint.image_url_medium || paint.image_url
  if (own) return own
  return paint.is_standard ? shipImage || null : null
}

/** Paints the picker offers: the hull's default (always, owned or not) first, then owned ones. */
export function pickerPaints(shipPaints, ownedSet) {
  const list = shipPaints || []
  const defaults = list.filter(p => p.is_default)
  const owned = list.filter(p => !p.is_default && ownedSet.has(p.id))
  return [...defaults, ...owned]
}

/** Whether a paint tile shows as equipped. NULL means the hull wears its default. */
export function isEquipped(paint, equippedPaintId) {
  if (equippedPaintId == null) return !!paint.is_default
  return paint.id === equippedPaintId
}

/**
 * The equipped_paint_id to send when a tile is clicked. The default paint is
 * stored as NULL, so picking it needs no ownership row; clicking the equipped
 * paint also goes back to the default.
 */
export function equipTarget(paint, equippedPaintId) {
  if (paint.is_default || paint.id === equippedPaintId) return null
  return paint.id
}

/** The paint a fleet entry is wearing, by name. */
export function wornPaintName(ship) {
  return ship.paint_name || ship.default_paint_name || null
}
