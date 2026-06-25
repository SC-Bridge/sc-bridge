// Helpers for the Salvageable ships browse page (#85). The API returns
// variant_types as a comma-separated string (GROUP_CONCAT) per ship.

export const VARIANT_LABELS = {
  derelict_salvage: 'Derelict (Salvage)',
  derelict: 'Derelict',
  boarded: 'Boarded (Mission)',
}

export function variantLabel(type) {
  return VARIANT_LABELS[type] || type
}

// Split a ship's comma-separated variant_types into a clean array.
export function shipVariantTypes(ship) {
  return String(ship?.variant_types || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// All distinct variant types across the dataset, sorted, for the filter chips.
export function collectVariantTypes(ships) {
  const set = new Set()
  for (const s of ships || []) {
    for (const v of shipVariantTypes(s)) set.add(v)
  }
  return [...set].sort()
}

// Filter by free-text (name / manufacturer) and a single variant type.
export function filterSalvageableShips(ships, { search = '', variant = 'all' } = {}) {
  const q = search.trim().toLowerCase()
  return (ships || []).filter((s) => {
    if (variant !== 'all' && !shipVariantTypes(s).includes(variant)) return false
    if (q) {
      const hay = `${s.name || ''} ${s.manufacturer_name || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
