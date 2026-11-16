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
  melee:          'Melee',
  armour:         'Armour',
  clothing:       'Clothing',
  attachment:     'Attachment',
  consumable:     'Consumable',
  harvestable:    'Harvestable',
  carryable:      'Carryable',
  prop:           'Prop',
  utility:        'Utility',
  ship_weapon:    'Ship Weapon',
  ship_component: 'Ship Component',
  missile:        'Missile',
  unknown:        'Other',
}

export const CATEGORY_BADGE_STYLES = {
  weapon:         'bg-red-900/40 text-red-300',
  melee:          'bg-red-800/40 text-red-200',
  armour:         'bg-blue-900/40 text-blue-300',
  clothing:       'bg-indigo-900/40 text-indigo-300',
  attachment:     'bg-orange-900/40 text-orange-300',
  consumable:     'bg-green-900/40 text-green-300',
  harvestable:    'bg-teal-900/40 text-teal-300',
  carryable:      'bg-amber-900/40 text-amber-300',
  prop:           'bg-gray-700/60 text-gray-300',
  utility:        'bg-yellow-900/40 text-yellow-300',
  ship_weapon:    'bg-red-900/40 text-red-200',
  ship_component: 'bg-violet-900/40 text-violet-300',
  missile:        'bg-rose-900/40 text-rose-300',
  unknown:        'bg-gray-700/60 text-gray-400',
}

export const CATEGORY_ORDER = [
  'weapon', 'melee', 'armour', 'clothing', 'attachment',
  'consumable', 'harvestable', 'carryable', 'prop', 'utility',
  'ship_weapon', 'ship_component', 'missile', 'unknown',
]

/**
 * Derive effective display category for a loot item.
 * Splits 'ship_component' WeaponGun items into 'ship_weapon'.
 * Merges 'helmet' into 'armour' — helmets are just another armour piece to users.
 */
export function effectiveCategory(item) {
  if (item.category === 'ship_component' && item.type === 'WeaponGun') return 'ship_weapon'
  if (item.category === 'helmet') return 'armour'
  return item.category
}

// ── Resistance stats ─────────────────────────────────────────────────────────
export const RESISTANCE_KEYS = [
  'resist_physical', 'resist_energy', 'resist_distortion',
  'resist_thermal', 'resist_biochemical', 'resist_stun',
]

export const RESISTANCE_LABELS = {
  resist_physical: 'Physical',
  resist_energy: 'Energy',
  resist_distortion: 'Distortion',
  resist_thermal: 'Thermal',
  resist_biochemical: 'Biochemical',
  resist_stun: 'Stun',
}

/**
 * Humanise raw-pattern item display names.
 *
 * Some loot items (mostly fps_clothing, fps_ammo_types, fps_carryables —
 * ~115 rows total) arrive from the pipeline with their class-name as
 * `name` because CIG never published a localised display name for them
 * (dev assets, NPC-only gear, etc.). Looks like `battaglia_pants_01` /
 * `arma_barrel_stab_s2_02`.
 *
 * Helper returns a Title-Cased rendition for these, leaves already-
 * humanised names alone. Intended for use at display-render sites only
 * — the underlying DB value stays raw as identity.
 */
const RAW_SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/
export function humanizeRawDisplayName(raw) {
  if (!raw || typeof raw !== 'string') return raw
  if (raw.includes(' ')) return raw  // already humanised
  if (!RAW_SNAKE_CASE_RE.test(raw)) return raw  // not raw snake_case
  if (!raw.includes('_')) return raw  // single-token lowercase — leave as-is
  return raw
    .split('_')
    .filter(Boolean)
    .map(t => {
      // Preserve numeric-only tokens
      if (/^\d+$/.test(t)) return t
      // Short caliber-like tokens keep uppercase ("s2" → "S2", "smg" → "SMG")
      if (t.length <= 3 && /[a-z]/.test(t)) return t.toUpperCase()
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * A carrying capacity in µSCU (storage_capacity), in the game's own wording:
 * 180000 → "180K µSCU", 127500 → "127.5K µSCU", 400 → "400 µSCU".
 * Returns null when there is no capacity to show.
 */
export function formatMicroScu(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  if (n < 1000) return `${Math.round(n)} µSCU`
  return `${Number((n / 1000).toFixed(1))}K µSCU`
}
