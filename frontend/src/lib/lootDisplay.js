// Shared loot display constants — used by LootDB, POI, POIDetail

// ── Rarity system ────────────────────────────────────────────────────────────
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']

export const RARITY_STYLES = {
  Common:    { badge: 'bg-gray-700/60 text-gray-300 border-gray-600/40', dot: 'text-gray-400', label: '● Common' },
  Uncommon:  { badge: 'bg-green-900/40 text-green-300 border-green-700/40', dot: 'text-green-400', label: '◆ Uncommon' },
  Rare:      { badge: 'bg-sc-accent/20 text-sc-accent border-sc-accent/40', dot: 'text-sc-accent', label: '✦ Rare' },
  Epic:      { badge: 'bg-purple-900/40 text-purple-300 border-purple-700/40', dot: 'text-purple-400', label: '★ Epic' },
  Legendary: { badge: 'bg-amber-900/40 text-amber-300 border-amber-700/40', dot: 'text-amber-400', label: '✸ Legendary' },
}

export function rarityStyle(rarity) {
  return RARITY_STYLES[rarity] || RARITY_STYLES.Common
}

// ── Category display ─────────────────────────────────────────────────────────
export const CATEGORY_LABELS = {
  weapon:         'Weapon',
  armour:         'Armour',
  helmet:         'Helmet',
  clothing:       'Clothing',
  attachment:     'Attachment',
  consumable:     'Consumable',
  harvestable:    'Harvestable',
  prop:           'Prop',
  utility:        'Utility',
  ship_component: 'Ship Component',
  missile:        'Missile',
  unknown:        'Other',
}

export const CATEGORY_BADGE_STYLES = {
  weapon:         'bg-red-900/40 text-red-300',
  armour:         'bg-blue-900/40 text-blue-300',
  helmet:         'bg-sky-900/40 text-sky-300',
  clothing:       'bg-indigo-900/40 text-indigo-300',
  attachment:     'bg-orange-900/40 text-orange-300',
  consumable:     'bg-green-900/40 text-green-300',
  harvestable:    'bg-teal-900/40 text-teal-300',
  prop:           'bg-gray-700/60 text-gray-300',
  utility:        'bg-yellow-900/40 text-yellow-300',
  ship_component: 'bg-violet-900/40 text-violet-300',
  missile:        'bg-rose-900/40 text-rose-300',
  unknown:        'bg-gray-700/60 text-gray-400',
}

export const CATEGORY_ORDER = [
  'weapon', 'armour', 'helmet', 'clothing', 'attachment',
  'consumable', 'harvestable', 'prop', 'utility', 'ship_component', 'missile', 'unknown',
]

// ── Resistance stats ─────────────────────────────────────────────────────────
export const RESISTANCE_KEYS = [
  'physical_resistance', 'energy_resistance', 'distortion_resistance',
  'thermal_resistance', 'biochemical_resistance', 'stun_resistance',
]

export const RESISTANCE_LABELS = {
  physical_resistance: 'Physical',
  energy_resistance: 'Energy',
  distortion_resistance: 'Distortion',
  thermal_resistance: 'Thermal',
  biochemical_resistance: 'Biochemical',
  stun_resistance: 'Stun',
}
