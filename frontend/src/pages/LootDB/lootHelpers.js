import { ShoppingCart, Package, Swords, Skull, FileText } from 'lucide-react'
import { friendlyShopName } from '../../lib/shopNames'
import { friendlyLocation, friendlyFaction } from '../../lib/lootLocations'

// ── Set name extraction ───────────────────────────────────────────────────────
export const PIECE_SUFFIXES = [
  'Sniper Rifle', 'Assault Rifle', 'Helmet', 'Chestplate', 'Backplate', 'Core', 'Arms', 'Legs',
  'Undersuit', 'Backpack', 'Hat', 'Jacket', 'Pants', 'Rifle', 'Pistol', 'SMG', 'Shotgun',
  'LMG', 'Launcher', 'Blade', 'Knife', 'Carbine', 'Suit', 'Gloves', 'Boots', 'Vest',
]

export function extractSetName(itemName, manufacturerName) {
  let s = itemName
  if (manufacturerName && s.startsWith(manufacturerName)) {
    s = s.slice(manufacturerName.length).trim()
  }
  // Try suffix at end first (base pieces: "Geist Armor Arms" → "Geist Armor")
  for (const suffix of PIECE_SUFFIXES) {
    if (s.endsWith(' ' + suffix)) {
      s = s.slice(0, -(suffix.length + 1)).trim()
      return s || null
    }
    if (s === suffix) return null
  }
  // Try suffix in middle (variant pieces: "Geist Armor Helmet Snow Camo" → "Geist Armor Snow Camo")
  for (const suffix of PIECE_SUFFIXES) {
    const marker = ' ' + suffix + ' '
    const idx = s.indexOf(marker)
    if (idx !== -1) {
      s = (s.slice(0, idx) + ' ' + s.slice(idx + marker.length)).trim()
      return s || null
    }
  }
  return s || null
}

// ── Pagination ────────────────────────────────────────────────────────────────
export const PAGE_SIZE_GRID = 60
export const PAGE_SIZE_LIST = 100

// ── Location entry resolver ───────────────────────────────────────────────────
export function resolveLocationEntry(entry, type) {
  if (typeof entry === 'string') return { label: entry, detail: null, probability: null }
  if (type === 'shops') {
    const rawShopKey = entry.shop || entry.name || ''
    const price = entry.buyPrice ? `${Math.round(entry.buyPrice).toLocaleString()} aUEC` : null
    return { label: friendlyShopName(rawShopKey), detail: price, probability: null, rawKey: rawShopKey, shopKey: true }
  }
  if (type === 'npcs' || type === 'corpses') {
    const rawFaction = entry.faction || entry.actor || entry.name
    const faction = friendlyFaction(rawFaction)
    return {
      label: faction,
      detail: entry.slot || null,
      probability: entry.probability ?? null,
      faction,
      rawKey: rawFaction,
      npcKey: true,
    }
  }
  if (type === 'contracts') {
    const guild = entry.guild || entry.contract || '?'
    const contractRef = entry.contract || null
    return { label: guild, detail: null, probability: null, contractKey: true, contractRef }
  }
  // containers, default
  const rawKey = entry.location || entry.locationTag || ''
  return {
    label: entry.location ? friendlyLocation(entry.location) : (entry.locationTag || entry.name || '?'),
    detail: entry.containerType || null,
    probability: entry.perContainer ?? entry.probability ?? null,
    rawKey,
  }
}

// ── JSON parsing ─────────────────────────────────────────────────────────────
export function parseJson(str) {
  if (!str || str === 'null' || str === '[]') return []
  try { return JSON.parse(str) || [] } catch { return [] }
}

// ── Shopping list aggregation ─────────────────────────────────────────────────
export const SOURCE_DEFS = [
  { key: 'shops',     label: 'Shops',      jsonKey: 'shops_json',     icon: ShoppingCart },
  { key: 'containers', label: 'Containers', jsonKey: 'containers_json', icon: Package },
  { key: 'npcs',      label: 'NPCs',       jsonKey: 'npcs_json',      icon: Swords },
  { key: 'corpses',   label: 'Corpses',    jsonKey: 'corpses_json',   icon: Skull },
  { key: 'contracts', label: 'Contracts',  jsonKey: 'contracts_json', icon: FileText },
]

export function buildShoppingList(wishlistItems) {
  if (!wishlistItems?.length) return {}
  const groups = {}
  const parseJson = (str) => { try { return JSON.parse(str) || [] } catch { return [] } }

  wishlistItems.forEach(item => {
    SOURCE_DEFS.forEach(({ key, label, jsonKey, icon }) => {
      const entries = parseJson(item[jsonKey])
      if (!entries.length) return
      if (!groups[key]) groups[key] = { label, icon, locations: {} }
      // Deduplicate locations within this item's JSON array (same location can appear
      // many times — one per container/NPC instance — which would duplicate item names)
      const uniqueLocs = [...new Set(entries.map(e => resolveLocationEntry(e, key).label))]
      uniqueLocs.forEach(loc => {
        if (!groups[key].locations[loc]) groups[key].locations[loc] = []
        groups[key].locations[loc].push(item.name)
      })
    })
  })
  return groups
}
