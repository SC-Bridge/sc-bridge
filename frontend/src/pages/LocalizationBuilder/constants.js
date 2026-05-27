// ── Category definitions ────────────────────────────────────────────

export const LABEL_CATEGORIES = [
  { key: 'labelsVehicleComponents', dbKey: 'vehicle_components', label: 'Ship Components', desc: 'Power plants, coolers, shields, quantum drives, turrets' },
  { key: 'labelsFpsWeapons', dbKey: 'fps_weapons', label: 'FPS Weapons', desc: 'Rifles, pistols, SMGs, shotguns, sniper rifles' },
  { key: 'labelsFpsArmour', dbKey: 'fps_armour', label: 'FPS Armour', desc: 'Torso, legs, arms, undersuits, backpacks' },
  { key: 'labelsFpsHelmets', dbKey: 'fps_helmets', label: 'Helmets', desc: 'All helmet types' },
  { key: 'labelsFpsAttachments', dbKey: 'fps_attachments', label: 'Weapon Attachments', desc: 'Sights, barrels, underbarrel' },
  { key: 'labelsFpsUtilities', dbKey: 'fps_utilities', label: 'Utilities', desc: 'Gadgets, medical, multitool' },
  { key: 'labelsConsumables', dbKey: 'consumables', label: 'Consumables', desc: 'Food, drinks, medical supplies' },
  { key: 'labelsShipMissiles', dbKey: 'ship_missiles', label: 'Ship Missiles', desc: 'Missiles and torpedoes' },
]

// Only fields with meaningful, varied data per category
export const CATEGORY_FIELDS = {
  vehicle_components: ['manufacturer', 'size', 'grade', 'subType'],
  fps_weapons: ['manufacturer', 'size', 'subType'],
  fps_armour: ['manufacturer', 'subType'],
  fps_helmets: ['manufacturer', 'grade', 'subType'],
  fps_attachments: ['manufacturer', 'subType'],
  fps_utilities: ['manufacturer', 'subType'],
  consumables: ['manufacturer', 'subType'],
  ship_missiles: ['seeker', 'manufacturer', 'size', 'subType'],
}

export const FIELD_LABELS = {
  manufacturer: 'Manufacturer',
  size: 'Size',
  grade: 'Grade',
  subType: 'Type',
  seeker: 'Seeker',
}

export const EXAMPLE_DATA = {
  vehicle_components: { name: 'FullStop', manufacturer: 'GODI', size: 2, grade: 'C', subType: 'Cooler' },
  fps_weapons: { name: 'Demeco LMG', manufacturer: 'KRIG', size: 2, grade: null, subType: 'LMG' },
  fps_armour: { name: 'Morozov Core', manufacturer: 'AEGS', size: null, grade: null, subType: 'Torso' },
  fps_helmets: { name: 'Calva Helmet', manufacturer: 'AEGS', size: null, grade: 'A', subType: 'Heavy' },
  fps_attachments: { name: '4x Scope', manufacturer: 'KBAR', size: null, grade: null, subType: 'Sight' },
  fps_utilities: { name: 'ParaMed', manufacturer: 'CRUS', size: null, grade: null, subType: 'Medical' },
  consumables: { name: "Big Benny's", manufacturer: null, size: null, grade: null, subType: 'Food' },
  ship_missiles: { name: 'Dominator II', manufacturer: 'THRT', size: 3, grade: null, subType: null, seeker: 'EM' },
}

// Key categories for per-category pack assignment (mirror of KEY_CATEGORIES
// in src/lib/localization.ts).
export const KEY_CATEGORIES = [
  { id: 'ship_names', label: 'Ship Names' },
  { id: 'items', label: 'Items & Gear' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'journal', label: 'Journal & Guides' },
  { id: 'ui', label: 'UI' },
  { id: 'other', label: 'Other' },
]

export function buildPreviewLabel(dbKey, fields, format) {
  const data = EXAMPLE_DATA[dbKey]
  if (!data) return '\u2014'
  const parts = []
  for (const field of fields) {
    if (field === 'manufacturer' && data.manufacturer) parts.push(data.manufacturer)
    if (field === 'size' && data.size != null) parts.push(`S${data.size}`)
    if (field === 'grade' && data.grade) parts.push(`Gr.${data.grade}`)
    if (field === 'subType' && data.subType) parts.push(data.subType)
    if (field === 'seeker' && data.seeker) parts.push(data.seeker)
  }
  const tag = parts.join(' | ')
  if (!tag) return data.name
  return format === 'prefix' ? `[${tag}] ${data.name}` : `${data.name} [${tag}]`
}

// Icon mapping for overlay packs (lucide icon names → components resolved at render time)
export const PACK_ICONS = {
  FlaskConical: 'FlaskConical',
  AlertTriangle: 'AlertTriangle',
  Gem: 'Gem',
  Wrench: 'Wrench',
  Zap: 'Zap',
  FileText: 'FileText',
}
