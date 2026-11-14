// Hull HP helpers for the ship pages.
//
// The API returns three hull fields (migration 0283, tools enrich/vehicle_xml.py):
//   hull_hp        the hull (body) part: the part whose destruction is the ship's
//   hull_hp_total  every structural part of the hull summed (doors and other
//                  item ports excluded)
//   hull_parts     [{ name, hp, parent, vital }] in XML order, or null

/** The figure to show as "Hull HP": the total, else the hull part (older cached responses). */
export function hullTotal(ship) {
  return ship?.hull_hp_total ?? ship?.hull_hp ?? null
}

/**
 * Readable name for a part from the vehicle XML. The game has no localised
 * names for hull parts, so the XML name is split into words; the root part,
 * which is named after the ship's class, is "Chassis".
 */
export function hullPartLabel(name, className) {
  if (!name) return ''
  if (className && name.toLowerCase() === className.toLowerCase()) return 'Chassis'
  return name
    .replace(/^\$/, '')
    .replace(/^(geo|dmg)_/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Parts in XML order, each with its depth under the nearest listed ancestor. */
export function hullPartRows(parts) {
  if (!Array.isArray(parts)) return []
  const depthOf = new Map()
  return parts.map(p => {
    const depth = p.parent != null && depthOf.has(p.parent) ? depthOf.get(p.parent) + 1 : 0
    depthOf.set(p.name, depth)
    return { ...p, depth }
  })
}
