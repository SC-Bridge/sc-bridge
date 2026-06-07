import { ShoppingCart, Package, Swords, FileText } from 'lucide-react'
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

// ── UEX staleness formatter ──────────────────────────────────────────────────
// Given a unix-seconds timestamp (community-report time from UEX), return a
// compact age suffix like "17d" / "3h" / "5m". Returns null if input is falsy.
// nowSec is injectable for deterministic tests.
export function formatStaleness(unixSec, nowSec = Math.floor(Date.now() / 1000)) {
  if (!unixSec || typeof unixSec !== 'number') return null
  const ageSec = Math.max(0, nowSec - unixSec)
  if (ageSec < 60) return '<1m'
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h`
  return `${Math.floor(ageSec / 86400)}d`
}

// ── Show filter predicate (collection / wishlist / crafted overlay) ───────────
// A crafted item is something you "have" just like a looted one (#92), so the
// "collected" view includes crafted items and "uncollected" excludes them.
// ctx: { collected: Map<uuid,qty>, wishlistIds: Set<uuid>, craftedMap: Record<uuid,qty> }
export function matchesShowFilter(item, show, ctx) {
  const { collected, wishlistIds, craftedMap } = ctx
  const uuid = item.uuid
  const isCrafted = (craftedMap?.[uuid] ?? 0) > 0
  const hasIt = collected.has(uuid) || isCrafted
  switch (show) {
    case 'collected':   return hasIt
    case 'uncollected': return !hasIt
    case 'wishlisted':  return wishlistIds.has(uuid)
    case 'crafted':     return isCrafted
    default:            return true // 'all' and any unknown value
  }
}

// ── Location entry resolver ───────────────────────────────────────────────────
export function resolveLocationEntry(entry, type) {
  if (typeof entry === 'string') return { label: entry, detail: null, probability: null }
  if (type === 'shops') {
    // Enrichment query provides shop_name + buy_price/sell_price;
    // loot_item_locations fallback uses location_key (UUID/slug)
    const rawShopKey = entry.shop_slug || entry.location_key || entry.shop || entry.name || ''
    const label = entry.shop_name || entry.location_label || friendlyShopName(rawShopKey)

    // Build price detail from actual data
    let detail = 'Price unknown'
    const buy = entry.buy_price
    const sell = entry.sell_price
    if (buy && sell) {
      detail = `Buy: ${Number(buy).toLocaleString()} · Sell: ${Number(sell).toLocaleString()} aUEC`
    } else if (buy) {
      detail = `Buy: ${Number(buy).toLocaleString()} aUEC`
    } else if (sell) {
      detail = `Sell: ${Number(sell).toLocaleString()} aUEC`
    }

    // Append UEX community-report age — "(17d)" means the last community update
    // to this terminal's price was 17 days ago. Empty when UEX hasn't reported
    // yet (new column 0247, NULL until the next sync touches the row).
    const staleness = formatStaleness(entry.uex_date_modified)
    if (staleness && detail !== 'Price unknown') {
      detail = `${detail} (${staleness})`
    }

    const locationLabel = entry.location_label || entry.shop_location || null
    return { label, detail, probability: null, rawKey: rawShopKey, shopKey: true, locationLabel }
  }
  if (type === 'npcs') {
    // Junction table: location_key=faction, actor, slot, probability, spawn_locations
    const rawFaction = entry.location_key || entry.faction || entry.actor || entry.name
    const faction = friendlyFaction(rawFaction)
    // Parse spawn_locations — JSON string from DB or array from loadout enrichment
    let spawnLocations = entry.spawn_locations || entry.spawnLocations || null
    if (typeof spawnLocations === 'string') {
      try { spawnLocations = JSON.parse(spawnLocations) } catch { spawnLocations = null }
    }
    return {
      label: faction,
      detail: entry.slot || null,
      probability: entry.probability ?? null,
      faction,
      rawKey: rawFaction,
      actor: entry.actor || null,
      factionCode: entry.faction_code || null,
      fromLoadout: entry.from_loadout || false,
      spawnLocations: Array.isArray(spawnLocations) && spawnLocations.length > 0 ? spawnLocations : null,
      npcKey: true,
    }
  }
  if (type === 'contracts') {
    // contract_name, guild, contract dropped in migration 0203 — canonical
    // source is contracts table. Frontend should prefer entry.contract fields
    // that come from the contracts JOIN; legacy entry.guild/contract_name stay
    // for backwards-compat with older cached responses.
    const guild = entry.guild || entry.contract || '?'
    const contractRef = entry.contract_name || entry.contract || null
    return { label: guild, detail: null, probability: null, contractKey: true, contractRef }
  }
  // containers, default — junction table: location_key, container_type, per_container
  const rawKey = entry.location_key || entry.location || ''
  return {
    label: rawKey ? friendlyLocation(rawKey) : (entry.name || '?'),
    detail: entry.container_type || entry.containerType || null,
    probability: entry.per_container ?? entry.perContainer ?? entry.probability ?? null,
    rawKey,
  }
}

// ── Shopping list aggregation ─────────────────────────────────────────────────
export const SOURCE_DEFS = [
  { key: 'shops',     label: 'Shops',      icon: ShoppingCart },
  { key: 'containers', label: 'Containers', icon: Package },
  { key: 'npcs',      label: 'NPCs',       icon: Swords },
  { key: 'contracts', label: 'Contracts',  icon: FileText },
]

export function buildShoppingList(wishlistItems) {
  if (!wishlistItems?.length) return {}
  const groups = {}

  wishlistItems.forEach(item => {
    SOURCE_DEFS.forEach(({ key, label, icon }) => {
      const entries = item.locations?.[key] || []
      if (!entries.length) return
      if (!groups[key]) groups[key] = { label, icon, locations: {} }
      const uniqueLocs = [...new Set(entries.map(e => resolveLocationEntry(e, key).label))]
      uniqueLocs.forEach(loc => {
        if (!groups[key].locations[loc]) groups[key].locations[loc] = []
        groups[key].locations[loc].push(item.name)
      })
    })
  })
  return groups
}

// ── Wishlist grouping ────────────────────────────────────────────────────────

// Top-level groups that merge related DB categories
export const WISHLIST_GROUPS = [
  { key: 'armour',          label: 'Armour',          categories: ['armour', 'helmet'] },
  { key: 'weapons',         label: 'Weapons',         categories: ['weapon'] },
  { key: 'clothing',        label: 'Clothing',        categories: ['clothing'] },
  { key: 'attachments',     label: 'Attachments',     categories: ['attachment'] },
  { key: 'consumables',     label: 'Consumables',     categories: ['consumable'] },
  { key: 'utility',         label: 'Utility',         categories: ['utility'] },
  { key: 'ship_components', label: 'Ship Components', categories: ['ship_component', 'missile'] },
  { key: 'other',           label: 'Other',           categories: ['harvestable', 'prop', 'unknown'] },
]

// Friendly sub-group labels derived from type/sub_type
const TYPE_LABELS = {
  Char_Armor_Arms: 'Arms', Char_Armor_Helmet: 'Helmets', Char_Armor_Torso: 'Core',
  Char_Armor_Legs: 'Legs', Char_Armor_Backpack: 'Backpacks', Char_Armor_Undersuit: 'Undersuits',
  Char_Clothing_Hat: 'Hats', Char_Clothing_Torso_0: 'Shirts', Char_Clothing_Torso_1: 'Jackets',
  Char_Clothing_Legs: 'Pants', Char_Clothing_Feet: 'Boots', Char_Clothing_Hands: 'Gloves',
  Char_Clothing_Backpack: 'Backpacks', Char_Accessory_Eyes: 'Eyewear',
  Cooler: 'Coolers', PowerPlant: 'Power Plants', QuantumDrive: 'Quantum Drives',
  Shield: 'Shields', WeaponGun: 'Ship Weapons', MiningModifier: 'Mining Lasers',
  MissileLauncher: 'Missile Racks', Turret: 'Turrets', Missile: 'Missiles',
  Drink: 'Drinks', Food: 'Food',
  FPS_Consumable: 'Medical', Gadget: 'Gadgets', RemovableChip: 'Data Chips',
  Misc: 'Miscellaneous',
}

// Weapons use sub_type for grouping
const WEAPON_SUB_LABELS = {
  Small: 'Pistols', Medium: 'Rifles', Large: 'Heavy Weapons',
  Knife: 'Melee', Grenade: 'Grenades', Gadget: 'Gadgets',
}
const ATTACHMENT_SUB_LABELS = {
  Barrel: 'Barrels', IronSight: 'Sights', Magazine: 'Magazines',
  BottomAttachment: 'Underbarrel', Utility: 'Utility', Missile: 'Missiles',
}

// Get a friendly sub-group label for an item
export function getSubGroupKey(item) {
  if (item.category === 'weapon') return WEAPON_SUB_LABELS[item.sub_type] || item.sub_type || 'Other'
  if (item.category === 'attachment') return ATTACHMENT_SUB_LABELS[item.sub_type] || item.sub_type || 'Other'
  return TYPE_LABELS[item.type] || item.type || 'Other'
}

// Group items into top-level groups > sub-groups
// Returns: [{ key, label, count, subGroups: [{ label, items }] }]
export function groupWishlistItems(items) {
  if (!items?.length) return []
  const catSet = new Set(items.map(i => i.category))
  return WISHLIST_GROUPS
    .filter(g => g.categories.some(c => catSet.has(c)))
    .map(g => {
      const groupItems = items.filter(i => g.categories.includes(i.category))
      // Build sub-groups
      const subMap = new Map()
      for (const item of groupItems) {
        const subLabel = getSubGroupKey(item)
        if (!subMap.has(subLabel)) subMap.set(subLabel, [])
        subMap.get(subLabel).push(item)
      }
      const subGroups = [...subMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, items]) => ({ label, items }))
      return { key: g.key, label: g.label, count: groupItems.length, subGroups }
    })
}

// ── Primary source (best place to find an item) ─────────────────────────────
// Priority: shops (guaranteed purchase) > highest-probability container/NPC/corpse > contracts
export function getPrimarySource(item) {
  const locs = item.locations || {}

  // Shops — pick first (prices are unreliable, so no sorting by price)
  const shops = locs.shops || []
  if (shops.length) {
    const entry = resolveLocationEntry(shops[0], 'shops')
    return { label: entry.label, type: 'shop', detail: null }
  }

  // Containers / NPCs — pick highest probability
  let best = null
  let bestProb = -1
  for (const key of ['containers', 'npcs']) {
    const entries = locs[key] || []
    for (const e of entries) {
      const resolved = resolveLocationEntry(e, key)
      const prob = resolved.probability ?? 0
      if (prob > bestProb || (!best && prob === 0)) {
        best = { label: resolved.label, type: key, detail: prob > 0 ? `${Math.round(prob * 100)}%` : null }
        bestProb = prob
      }
    }
  }
  if (best) return best

  // Contracts fallback
  const contracts = locs.contracts || []
  if (contracts.length) {
    const entry = resolveLocationEntry(contracts[0], 'contracts')
    return { label: entry.label, type: 'contract', detail: null }
  }

  return null
}

// Build location-grouped view: { locationLabel: { sourceType, items[] } }
export function groupWishlistByLocation(items) {
  if (!items?.length) return []
  const locMap = new Map() // locationLabel → { sourceType, sourceLabel, sourceIcon, itemNames: Set }

  for (const item of items) {
    for (const { key, label, icon } of SOURCE_DEFS) {
      const entries = item.locations?.[key] || []
      if (!entries.length) continue
      const uniqueLocs = [...new Set(entries.map(e => resolveLocationEntry(e, key).label))]
      for (const loc of uniqueLocs) {
        const mapKey = `${key}::${loc}`
        if (!locMap.has(mapKey)) {
          locMap.set(mapKey, { location: loc, sourceType: key, sourceLabel: label, sourceIcon: icon, items: [] })
        }
        locMap.get(mapKey).items.push(item)
      }
    }
  }

  // Sort by location name, group by source type
  return [...locMap.values()].sort((a, b) => a.location.localeCompare(b.location))
}

// ── Saved builds as Item-Finder items (#90) ─────────────────────────────────
// A saved build is "my tuned version of this item". Map crafting modifier keys
// → the loot item's stat fields so a build renders as a real item card with its
// own numbers (and a base→tuned lift on the headline stat).
export const BUILD_MULT_FIELDS = {
  weapon_damage: ['damage'],
  weapon_firerate: ['rounds_per_minute'],
  armor_damagemitigation: ['resist_physical', 'resist_energy', 'resist_distortion', 'resist_stun', 'resist_thermal'],
}

/**
 * Apply a saved build's per-stat multipliers to any stat-bearing object (a loot
 * item row OR an item_details sub-table row — they share field names). Returns a
 * new object with the mapped fields scaled and dps recomputed. Pure.
 */
export function applyBuildMultipliers(obj, multipliers) {
  if (!obj) return obj
  const m = multipliers || {}
  const out = { ...obj }
  for (const [key, fields] of Object.entries(BUILD_MULT_FIELDS)) {
    const mult = m[key]
    if (mult == null || mult === 1) continue
    for (const f of fields) {
      if (typeof out[f] === 'number') out[f] = out[f] * mult
    }
  }
  // dps = damage × rpm / 60, so it scales by the product of those two mults.
  const dmgM = m.weapon_damage ?? 1
  const fireM = m.weapon_firerate ?? 1
  if (typeof obj.dps === 'number' && (dmgM !== 1 || fireM !== 1)) {
    out.dps = obj.dps * dmgM * fireM
  }
  return out
}

/**
 * Build a synthetic Item-Finder item from a base loot item + a saved build
 * (id, name, crafted, multipliers, blueprintId). Scales the mapped stat fields,
 * recomputes dps, and stashes `_build` metadata + a `_lift` (headline base→tuned)
 * for the card. Returns null if there's no base item.
 */
export function buildSyntheticItem(base, build) {
  if (!base) return null
  const m = build.multipliers || {}
  const out = {
    ...applyBuildMultipliers(base, m),
    id: `build-${build.id}`,
    name: build.name,
    _build: {
      id: build.id,
      name: build.name,
      crafted: build.crafted ?? 0,
      baseName: base.name,
      baseUuid: base.uuid,
      blueprintId: build.blueprintId ?? null,
      multipliers: m,
    },
  }

  // Headline base→tuned for the card (weapons: DPS).
  if (typeof base.dps === 'number' && out.dps !== base.dps) {
    out._lift = { label: 'DPS', base: base.dps, tuned: out.dps }
  }
  return out
}
