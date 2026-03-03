import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Search, Package, ShoppingCart, Swords, Skull, FileText,
  LayoutGrid, List, X, ChevronRight, Check, Plus, Bookmark, BookmarkPlus
} from 'lucide-react'
import {
  useLoot, useLootItem, useLootCollection, toggleLootCollection,
  useLootWishlist, toggleLootWishlist,
  setLootCollectionQuantity, setLootWishlistQuantity,
} from '../hooks/useAPI'
import { useSession } from '../lib/auth-client'
import { friendlyShopName } from '../lib/shopNames'
import { friendlyLocation, friendlyFaction, getLocationGroup } from '../lib/lootLocations'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'

// ── Rarity system ────────────────────────────────────────────────────────────
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']

const RARITY_STYLES = {
  Common:    { badge: 'bg-gray-700/60 text-gray-300 border-gray-600/40', dot: 'text-gray-400', label: '● Common' },
  Uncommon:  { badge: 'bg-green-900/40 text-green-300 border-green-700/40', dot: 'text-green-400', label: '◆ Uncommon' },
  Rare:      { badge: 'bg-sc-accent/20 text-sc-accent border-sc-accent/40', dot: 'text-sc-accent', label: '✦ Rare' },
  Epic:      { badge: 'bg-purple-900/40 text-purple-300 border-purple-700/40', dot: 'text-purple-400', label: '★ Epic' },
  Legendary: { badge: 'bg-amber-900/40 text-amber-300 border-amber-700/40', dot: 'text-amber-400', label: '✸ Legendary' },
}

function rarityStyle(rarity) {
  return RARITY_STYLES[rarity] || RARITY_STYLES.Common
}

// ── Category display ─────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
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

const CATEGORY_BADGE_STYLES = {
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

// ── Set name extraction ───────────────────────────────────────────────────────
const PIECE_SUFFIXES = [
  'Sniper Rifle', 'Assault Rifle', 'Helmet', 'Chestplate', 'Backplate', 'Arms', 'Legs',
  'Undersuit', 'Backpack', 'Hat', 'Jacket', 'Pants', 'Rifle', 'Pistol', 'SMG', 'Shotgun',
  'LMG', 'Launcher', 'Blade', 'Knife', 'Carbine', 'Suit', 'Gloves', 'Boots', 'Vest',
]

function extractSetName(itemName, manufacturerName) {
  let s = itemName
  if (manufacturerName && s.startsWith(manufacturerName)) {
    s = s.slice(manufacturerName.length).trim()
  }
  for (const suffix of PIECE_SUFFIXES) {
    if (s.endsWith(' ' + suffix)) {
      s = s.slice(0, -(suffix.length + 1)).trim()
      break
    }
    if (s === suffix) {
      s = ''
      break
    }
  }
  return s || null
}

// ── Source icons ─────────────────────────────────────────────────────────────
function SourceIcons({ item }) {
  return (
    <div className="flex items-center gap-1.5">
      {item.has_shops    ? <ShoppingCart className="w-3 h-3 text-gray-400" title="Shops" /> : null}
      {item.has_containers ? <Package className="w-3 h-3 text-gray-400" title="Containers" /> : null}
      {item.has_npcs     ? <Swords className="w-3 h-3 text-gray-400" title="NPCs" /> : null}
      {item.has_corpses  ? <Skull className="w-3 h-3 text-gray-400" title="Corpses" /> : null}
      {item.has_contracts ? <FileText className="w-3 h-3 text-gray-400" title="Contracts" /> : null}
    </div>
  )
}

// ── Collection quantity stepper ───────────────────────────────────────────────
function CollectionStepper({ qty, onSetQty }) {
  if (qty === 0) {
    return (
      <button
        onClick={() => onSetQty(1)}
        className="w-5 h-5 rounded border border-gray-600 flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-300 transition-all shrink-0"
        title="Mark collected"
      >
        <Plus className="w-3 h-3" />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={() => onSetQty(qty - 1)}
        className="w-5 h-5 rounded border border-sc-accent/40 flex items-center justify-center text-sc-accent hover:bg-sc-accent/20 transition-all text-xs leading-none"
        title={qty === 1 ? 'Remove from collection' : 'Decrease'}
      >−</button>
      <span className="text-[10px] font-mono text-sc-accent min-w-[14px] text-center">{qty}</span>
      <button
        onClick={() => onSetQty(qty + 1)}
        className="w-5 h-5 rounded border border-sc-accent/40 flex items-center justify-center text-sc-accent hover:bg-sc-accent/20 transition-all"
        title="Increase"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, collectionQty, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onSelect }) {
  const rs = rarityStyle(item.rarity)
  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[item.category] || item.category

  return (
    <div
      className={`panel p-3 flex flex-col gap-2 cursor-pointer hover:border-sc-border/80 transition-all duration-150 ${collectionQty > 0 ? 'opacity-75' : ''}`}
      onClick={() => onSelect(item.uuid)}
    >
      {/* Top row: category badge + wishlist icon + rarity badge */}
      <div className="flex items-center gap-1">
        <span className={`text-[9px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
          {catLabel}
        </span>
        <div className="flex-1" />
        {isAuthed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWishlist(item.uuid, wishlisted) }}
            className={`flex items-center justify-center transition-all duration-150 shrink-0 ${
              wishlisted ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            {wishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          </button>
        )}
        {item.rarity && (
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
            {item.rarity}
          </span>
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-gray-200 leading-tight line-clamp-2 flex-1">
        {item.name}
      </p>

      {/* Bottom row: sources + collection stepper */}
      <div className="flex items-center justify-between">
        <SourceIcons item={item} />
        {isAuthed && (
          <div onClick={(e) => e.stopPropagation()}>
            <CollectionStepper
              qty={collectionQty}
              onSetQty={(qty) => onSetCollectionQty(item.uuid, qty)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Location grouping config ──────────────────────────────────────────────────
const LOCATION_GROUP_CONFIG = {
  named:     { label: 'Named Locations', order: 0 },
  cave:      { label: 'Caves',           order: 1 },
  outpost:   { label: 'Outposts',        order: 2 },
  dc:        { label: 'Distribution Centres', order: 3 },
  facility:  { label: 'Facilities',      order: 4 },
  contested: { label: 'Contested Zones', order: 5 },
  station:   { label: 'Stations',        order: 6 },
  derelict:  { label: 'Derelicts',       order: 7 },
  generic:   { label: 'Generic',         order: 8 },
}

// ── Location section renderer ─────────────────────────────────────────────────
function resolveLocationEntry(entry, type) {
  if (typeof entry === 'string') return { label: entry, detail: null, probability: null }
  if (type === 'shops') {
    const price = entry.buyPrice ? `${Math.round(entry.buyPrice).toLocaleString()} aUEC` : null
    return { label: friendlyShopName(entry.shop || entry.name), detail: price, probability: null }
  }
  if (type === 'npcs' || type === 'corpses') {
    const rawFaction = entry.faction || entry.actor || entry.name
    const faction = friendlyFaction(rawFaction)
    return {
      label: faction,
      detail: entry.slot || null,
      probability: entry.probability ?? null,
      faction,
    }
  }
  // containers, contracts, default
  const rawKey = entry.location || entry.locationTag || ''
  return {
    label: entry.location ? friendlyLocation(entry.location) : (entry.locationTag || entry.name || '?'),
    detail: entry.containerType || null,
    probability: entry.perContainer ?? entry.probability ?? null,
    rawKey,
  }
}

function LocationRow({ row }) {
  return (
    <div className="flex items-center justify-between gap-2 pl-2 border-l border-sc-border">
      <span className="text-xs font-mono text-gray-300 break-words min-w-0">{row.label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {row.detail && (
          <span className="text-[9px] font-mono text-gray-500">{row.detail}</span>
        )}
        {row.probability != null && (
          <span className="text-[9px] font-mono text-gray-600">{(row.probability * 100).toFixed(1)}%</span>
        )}
      </div>
    </div>
  )
}

function LocationSection({ label, icon: Icon, data, type }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null

  // Deduplicate: npcs/corpses key by faction+slot; others by label
  const seen = new Map()
  for (const entry of data) {
    const row = resolveLocationEntry(entry, type)
    const key = (type === 'npcs' || type === 'corpses')
      ? `${row.label}|${row.detail || ''}`
      : row.label
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, row)
    } else if (row.probability != null && (existing.probability == null || row.probability > existing.probability)) {
      existing.probability = row.probability
    }
  }

  const rows = [...seen.values()]

  // Grouped rendering for containers
  if (type === 'containers') {
    // Bucket rows by group
    const buckets = new Map()
    for (const row of rows) {
      const groupKey = getLocationGroup(row.rawKey)
      if (!buckets.has(groupKey)) buckets.set(groupKey, [])
      buckets.get(groupKey).push(row)
    }

    // Sort groups by config order; sort rows within each group alphabetically
    const sortedGroups = [...buckets.entries()].sort(([a], [b]) => {
      const ao = LOCATION_GROUP_CONFIG[a]?.order ?? 99
      const bo = LOCATION_GROUP_CONFIG[b]?.order ?? 99
      return ao - bo
    })
    for (const [, groupRows] of sortedGroups) {
      groupRows.sort((a, b) => a.label.localeCompare(b.label))
    }

    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
        </div>
        <div className="space-y-3">
          {sortedGroups.map(([groupKey, groupRows]) => (
            <div key={groupKey}>
              <p className="text-[9px] font-display uppercase tracking-wider text-gray-500 mb-1 pl-2">
                {LOCATION_GROUP_CONFIG[groupKey]?.label ?? groupKey}
              </p>
              <div className="space-y-1">
                {groupRows.map((row, i) => <LocationRow key={i} row={row} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Grouped rendering for npcs / corpses — group by faction
  if (type === 'npcs' || type === 'corpses') {
    const factionMap = new Map()
    for (const row of rows) {
      const key = row.faction || row.label
      if (!factionMap.has(key)) factionMap.set(key, [])
      factionMap.get(key).push(row)
    }
    const sortedFactions = [...factionMap.entries()].sort(([a], [b]) => a.localeCompare(b))

    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
        </div>
        <div className="space-y-3">
          {sortedFactions.map(([factionName, factionRows]) => (
            <div key={factionName}>
              <p className="text-[9px] font-display uppercase tracking-wider text-gray-500 mb-1 pl-2">
                {factionName}
              </p>
              <div className="space-y-1">
                {factionRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 pl-2 border-l border-sc-border">
                    <span className="text-xs font-mono text-gray-300">{row.detail || '—'}</span>
                    {row.probability != null && (
                      <span className="text-[9px] font-mono text-gray-600">{(row.probability * 100).toFixed(1)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Default flat rendering (shops, contracts)
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className="space-y-1">
        {rows.map((row, i) => <LocationRow key={i} row={row} />)}
      </div>
    </div>
  )
}

// ── Detail panel helpers ──────────────────────────────────────────────────────

/**
 * Fix UTF-8 mojibake stored in D1 (e.g. "Â°C" → "°C", "Âµ" → "µ").
 * Caused by double-encoding: UTF-8 bytes stored as Latin-1 characters.
 */
function decodeMojibake(str) {
  if (!str || typeof str !== 'string') return str
  try {
    const encoded = str.replace(/[\x80-\xFF]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    return decodeURIComponent(encoded)
  } catch { return str }
}

/**
 * Format a fire_modes array into readable text.
 * e.g. ["Burst", "Single"] + burst_count=3 → "3-Round Burst, Single"
 */
function formatFireModes(modes, burstCount) {
  if (!Array.isArray(modes) || modes.length === 0) return null
  return modes
    .map(m => (m === 'Burst' && burstCount) ? `${burstCount}-Round Burst` : m)
    .join(', ')
}

/** Human-readable labels for known stats_json fields. null = hidden. */
const STAT_LABELS = {
  // FPS weapons
  item_port_count:       'Attachment Slots',
  ammo_capacity:         'Ammo Capacity',
  rounds_per_minute:     'Rounds / Min',
  fire_modes:            'Fire Modes',
  burst_count:           null,           // merged into fire_modes display
  // Helmet damage resistances (multiplier: lower = more resistant)
  physical_resistance:   'Physical Resist',
  energy_resistance:     'Energy Resist',
  distortion_resistance: 'Distortion Resist',
  thermal_resistance:    'Thermal Resist',
  biochemical_resistance:'Biochemical Resist',
  stun_resistance:       'Stun Resist',
  // Helmet misc
  atmosphere_capacity:   'Atmosphere',
  ir_emission:           'IR Emission',
  em_emission:           'EM Emission',
  // Attachments
  zoom_scale:            'Zoom',
  second_zoom_scale:     'Alt Zoom',
  damage_multiplier:     'Damage Modifier',
  sound_radius_multiplier:'Sound Radius',
}

/** Display order for known stats fields. Unknown fields sort alphabetically after. */
const STAT_ORDER = [
  'item_port_count', 'ammo_capacity', 'rounds_per_minute', 'fire_modes',
  'zoom_scale', 'second_zoom_scale', 'damage_multiplier', 'sound_radius_multiplier',
  'physical_resistance', 'energy_resistance', 'distortion_resistance',
  'thermal_resistance', 'biochemical_resistance', 'stun_resistance',
  'atmosphere_capacity', 'ir_emission', 'em_emission',
]

/** Keys where the stored value is a multiplier (1.0 = base); display as % of base. */
const MULTIPLIER_STATS = new Set(['damage_multiplier', 'sound_radius_multiplier'])
/** Keys where the stored value is a damage resistance multiplier (lower = more resistant). */
const RESISTANCE_STATS = new Set([
  'physical_resistance', 'energy_resistance', 'distortion_resistance',
  'thermal_resistance', 'biochemical_resistance', 'stun_resistance',
])

// ── Detail slide-over ─────────────────────────────────────────────────────────
function DetailPanel({ uuid, manufacturerName, collectionQty, onSetCollectionQty, wishlisted, onToggleWishlist, isAuthed, onClose }) {
  const { data: item, loading } = useLootItem(uuid)

  if (!uuid) return null

  const parsedJson = (key) => {
    if (!item?.[key] || item[key] === 'null' || item[key] === '[]') return []
    try { return JSON.parse(item[key]) } catch { return [] }
  }

  const rs = item?.rarity ? rarityStyle(item.rarity) : null
  const catStyle = item ? CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown : ''
  const catLabel = item ? CATEGORY_LABELS[item.category] || item.category : ''

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[28rem] bg-sc-darker border-l border-sc-border z-50 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sc-border shrink-0">
          <span className="text-xs font-display uppercase tracking-wider text-gray-400">Item Detail</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <LoadingState message="Loading item..." />
          </div>
        )}

        {item && !loading && (
          <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-5">
            {/* Name + badges */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white leading-tight">{item.name}</h2>
              {manufacturerName && (
                <p className="text-[10px] font-mono text-gray-500">{manufacturerName}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[9px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
                  {catLabel}
                </span>
                {item.rarity && rs && (
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge}`}>
                    {item.rarity}
                  </span>
                )}
                {item.sub_type && (
                  <span className="text-[9px] font-mono text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
                    {item.sub_type}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {isAuthed && (
              <div className="flex gap-2">
                <button
                  onClick={() => onToggleWishlist(uuid, wishlisted)}
                  className={`flex-1 py-2 rounded text-xs font-display uppercase tracking-wide border transition-all duration-150 flex items-center justify-center gap-2 ${
                    wishlisted
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'border-sc-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  {wishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                  {wishlisted ? 'On Wishlist' : 'Add to Wishlist'}
                </button>
                <div className="flex-1 border border-sc-border rounded flex items-center justify-center gap-2 py-2">
                  {collectionQty === 0 ? (
                    <button
                      onClick={() => onSetCollectionQty(uuid, 1)}
                      className="flex items-center gap-1.5 text-xs font-display uppercase tracking-wide text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Mark Collected
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onSetCollectionQty(uuid, collectionQty - 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-sc-accent hover:bg-sc-accent/20 transition-colors text-base leading-none"
                        title={collectionQty === 1 ? 'Remove from collection' : 'Decrease'}
                      >−</button>
                      <span className="text-sm font-mono text-sc-accent min-w-[20px] text-center">{collectionQty}</span>
                      <button
                        onClick={() => onSetCollectionQty(uuid, collectionQty + 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-sc-accent hover:bg-sc-accent/20 transition-colors"
                        title="Increase"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-display uppercase tracking-wide text-sc-accent/70">Collected</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Item stats from linked table */}
            {item.item_details && (() => {
              const det = item.item_details
              const hasDescription = !!det.description
              const hasType = det.type && det.type !== item.type
              const hasSubType = !!det.sub_type && det.sub_type !== 'UNDEFINED' && det.sub_type !== det.type
              const hasSlot = !!det.slot
              const hasSize = det.size != null
              const hasGrade = det.grade != null
              const hasStats = det.stats_json && det.stats_json !== 'null'
              if (!hasDescription && !hasType && !hasSubType && !hasSlot && !hasSize && !hasGrade && !hasStats) return null

              // Parse and sort stats entries: known fields first (STAT_ORDER), then alphabetical
              let statsEntries = []
              if (hasStats) {
                try {
                  const stats = JSON.parse(det.stats_json)
                  statsEntries = Object.entries(stats)
                    .filter(([k]) => STAT_LABELS[k] !== null)
                    .sort(([a], [b]) => {
                      const ai = STAT_ORDER.indexOf(a)
                      const bi = STAT_ORDER.indexOf(b)
                      if (ai === -1 && bi === -1) return a.localeCompare(b)
                      if (ai === -1) return 1
                      if (bi === -1) return -1
                      return ai - bi
                    })
                    .map(([k, v]) => {
                      const label = STAT_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                      let display
                      if (k === 'fire_modes') {
                        display = formatFireModes(v, stats.burst_count)
                      } else if (Array.isArray(v)) {
                        display = v.join(', ')
                      } else if (RESISTANCE_STATS.has(k) && typeof v === 'number') {
                        // e.g. 0.6 → "40% reduction"
                        display = `${Math.round((1 - v) * 100)}% reduction`
                      } else if (MULTIPLIER_STATS.has(k) && typeof v === 'number') {
                        // e.g. 0.66 → "66% of base"
                        display = `${Math.round(v * 100)}% of base`
                      } else if ((k === 'zoom_scale' || k === 'second_zoom_scale') && typeof v === 'number') {
                        display = `${v}x`
                      } else {
                        display = String(v)
                      }
                      return { k, label, display }
                    })
                    .filter(({ display }) => display)
                } catch { /* skip */ }
              }

              return (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-2">Item Details</p>
                  <div className="space-y-1 text-xs font-mono">
                    {hasType && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Type</span>
                        <span className="text-gray-300">{det.type}</span>
                      </div>
                    )}
                    {hasSubType && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Sub Type</span>
                        <span className="text-gray-300">{det.sub_type}</span>
                      </div>
                    )}
                    {hasSlot && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Slot</span>
                        <span className="text-gray-300">{det.slot}</span>
                      </div>
                    )}
                    {hasSize && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Size</span>
                        <span className="text-gray-300">S{det.size}</span>
                      </div>
                    )}
                    {hasGrade && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Grade</span>
                        <span className="text-gray-300">{det.grade}</span>
                      </div>
                    )}
                    {/* stats_json fields before description so RPM/fire modes group with structural info */}
                    {statsEntries.map(({ k, label, display }) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">{label}</span>
                        <span className="text-gray-300">{display}</span>
                      </div>
                    ))}
                    {hasDescription && (
                      <p className="text-gray-400 text-[11px] leading-relaxed whitespace-pre-wrap pt-1">
                        {decodeMojibake(det.description.replace(/\\n/g, '\n'))}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Where to find — parse JSON directly (has_* flags not present in detail response) */}
            {(() => {
              const locationSections = [
                { label: 'Shops',      icon: ShoppingCart, type: 'shops',      data: parsedJson('shops_json') },
                { label: 'Containers', icon: Package,      type: 'containers', data: parsedJson('containers_json') },
                { label: 'NPCs',       icon: Swords,       type: 'npcs',       data: parsedJson('npcs_json') },
                { label: 'Corpses',    icon: Skull,        type: 'corpses',    data: parsedJson('corpses_json') },
                { label: 'Contracts',  icon: FileText,     type: 'contracts',  data: parsedJson('contracts_json') },
              ]
              const hasAny = locationSections.some(s => s.data.length > 0)
              return hasAny ? (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">Where to Find</p>
                  <div className="space-y-4">
                    {locationSections.map(({ label, icon, data, type }) => (
                      <LocationSection key={label} label={label} icon={icon} data={data} type={type} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 font-mono">No location data available.</p>
              )
            })()}
          </div>
        )}
      </div>
    </>
  )
}

// ── Wishlist list row (no card boxes — clean flat list) ───────────────────────
function WishlistRow({ item, collectionQty, onSetCollectionQty, wishlistQty, onSetWishlistQty, onSelect }) {
  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[item.category] || item.category
  const rs = item.rarity ? rarityStyle(item.rarity) : null

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 border-b border-sc-border hover:bg-white/3 cursor-pointer transition-colors"
      onClick={() => onSelect(item.uuid)}
    >
      <span className={`text-[9px] font-display uppercase px-1.5 py-0.5 rounded shrink-0 w-20 text-center ${catStyle}`}>
        {catLabel}
      </span>
      <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
      {item.rarity && rs && (
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge} shrink-0`}>
          {item.rarity}
        </span>
      )}
      <SourceIcons item={item} />
      <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Wishlist qty stepper (want N) — decrement to 0 removes from wishlist */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-amber-500/60 font-mono mr-0.5">want</span>
          <button
            onClick={() => onSetWishlistQty(item.uuid, wishlistQty - 1)}
            className="w-5 h-5 rounded border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/10 transition-all text-xs leading-none"
            title={wishlistQty === 1 ? 'Remove from wishlist' : 'Decrease'}
          >−</button>
          <span className="text-[10px] font-mono text-amber-400 min-w-[14px] text-center">{wishlistQty}</span>
          <button
            onClick={() => onSetWishlistQty(item.uuid, wishlistQty + 1)}
            className="w-5 h-5 rounded border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/10 transition-all"
            title="Increase"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {/* Collection qty stepper (have N) */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-500 font-mono mr-0.5">have</span>
          <CollectionStepper qty={collectionQty} onSetQty={(qty) => onSetCollectionQty(item.uuid, qty)} />
        </div>
      </div>
    </div>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
const PAGE_SIZE_GRID = 60
const PAGE_SIZE_LIST = 100

// ── Shopping list aggregation ─────────────────────────────────────────────────
const SOURCE_DEFS = [
  { key: 'shops',     label: 'Shops',      jsonKey: 'shops_json',     icon: ShoppingCart },
  { key: 'containers', label: 'Containers', jsonKey: 'containers_json', icon: Package },
  { key: 'npcs',      label: 'NPCs',       jsonKey: 'npcs_json',      icon: Swords },
  { key: 'corpses',   label: 'Corpses',    jsonKey: 'corpses_json',   icon: Skull },
  { key: 'contracts', label: 'Contracts',  jsonKey: 'contracts_json', icon: FileText },
]

function buildShoppingList(wishlistItems) {
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LootDB() {
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const { data: allItems, loading, error } = useLoot()
  const { data: collectionIds, refetch: refetchCollection } = useLootCollection(isAuthed)
  const { data: wishlistItems, refetch: refetchWishlist } = useLootWishlist(isAuthed)

  // Map<loot_map_id, quantity> — backend now returns [{loot_map_id, quantity}]
  const collected = useMemo(() => {
    if (!collectionIds) return new Map()
    return new Map(collectionIds.map(e => [e.loot_map_id, e.quantity]))
  }, [collectionIds])

  // Map<loot_map_id, wishlist_quantity>
  const wishlistMap = useMemo(
    () => new Map(wishlistItems?.map(i => [i.id, i.wishlist_quantity ?? 1]) ?? []),
    [wishlistItems]
  )
  const wishlistIds = useMemo(
    () => new Set(wishlistItems?.map(i => i.id) ?? []),
    [wishlistItems]
  )

  const [activeTab, setActiveTab] = useState('browse')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [brand, setBrand] = useState(null)
  const [setName, setSetName] = useState(null)
  const [rarities, setRarities] = useState(new Set())
  const [sources, setSources] = useState(new Set())
  const [viewMode, setViewMode] = useState('grid')
  const [detailUuid, setDetailUuid] = useState(null)
  const [page, setPage] = useState(1)

  // Collection tab state
  const [collSearch, setCollSearch] = useState('')
  const [collCategory, setCollCategory] = useState('all')

  // Reset cascades
  useEffect(() => { setBrand(null); setSetName(null) }, [category])
  useEffect(() => { setSetName(null) }, [brand])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, category, brand, setName, rarities, sources])

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!allItems) return {}
    const counts = {}
    for (const item of allItems) {
      counts[item.category] = (counts[item.category] || 0) + 1
    }
    return counts
  }, [allItems])

  // Collection tab — items the user has collected
  const collectedItems = useMemo(() => {
    if (!allItems) return []
    return allItems.filter(i => collected.has(i.id))
  }, [allItems, collected])

  // Per-category collection stats: { weapon: { total, collected }, ... }
  const collectionCategoryStats = useMemo(() => {
    if (!allItems) return {}
    const stats = {}
    for (const item of allItems) {
      if (!stats[item.category]) stats[item.category] = { total: 0, collected: 0 }
      stats[item.category].total++
      if (collected.has(item.id)) stats[item.category].collected++
    }
    return stats
  }, [allItems, collected])

  const filteredCollectedItems = useMemo(() => {
    let items = collectedItems
    if (collCategory !== 'all') items = items.filter(i => i.category === collCategory)
    if (collSearch.trim()) {
      const q = collSearch.toLowerCase()
      items = items.filter(i => i.name.toLowerCase().includes(q))
    }
    return items
  }, [collectedItems, collCategory, collSearch])

  // All categories present in data
  const categories = useMemo(() => {
    if (!allItems) return []
    const seen = new Set(allItems.map((i) => i.category))
    const ordered = ['weapon', 'armour', 'helmet', 'clothing', 'attachment', 'consumable', 'harvestable', 'prop', 'utility', 'ship_component', 'missile', 'unknown']
    return ordered.filter((c) => seen.has(c))
  }, [allItems])

  // Brand counts (scoped to current category)
  const brands = useMemo(() => {
    if (!allItems) return new Map()
    const map = new Map()
    const base = category !== 'all' ? allItems.filter(i => i.category === category) : allItems
    for (const item of base) {
      if (item.manufacturer_name) {
        map.set(item.manufacturer_name, (map.get(item.manufacturer_name) || 0) + 1)
      }
    }
    return map
  }, [allItems, category])

  // Set/model name counts (scoped to current brand + category)
  const setNames = useMemo(() => {
    if (!allItems || !brand) return new Map()
    const map = new Map()
    let base = allItems.filter(i => i.manufacturer_name === brand)
    if (category !== 'all') base = base.filter(i => i.category === category)
    for (const item of base) {
      const sn = extractSetName(item.name, item.manufacturer_name)
      if (sn) {
        map.set(sn, (map.get(sn) || 0) + 1)
      }
    }
    return map
  }, [allItems, brand, category])

  // Filtered items
  const filtered = useMemo(() => {
    if (!allItems) return []
    let items = allItems

    if (category !== 'all') {
      items = items.filter((i) => i.category === category)
    }

    if (brand) {
      items = items.filter((i) => i.manufacturer_name === brand)
    }

    if (setName) {
      items = items.filter((i) => extractSetName(i.name, i.manufacturer_name) === setName)
    }

    if (rarities.size > 0) {
      items = items.filter((i) => rarities.has(i.rarity || 'Common'))
    }

    if (sources.size > 0) {
      items = items.filter((i) => {
        if (sources.has('shops')     && i.has_shops)     return true
        if (sources.has('containers') && i.has_containers) return true
        if (sources.has('npcs')      && i.has_npcs)     return true
        if (sources.has('corpses')   && i.has_corpses)  return true
        if (sources.has('contracts') && i.has_contracts) return true
        return false
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.type && i.type.toLowerCase().includes(q)) ||
        (i.sub_type && i.sub_type.toLowerCase().includes(q))
      )
    }

    return items
  }, [allItems, category, brand, setName, rarities, sources, search])

  const pageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const collectionCount = collected.size  // unique items collected (not sum of quantities)
  const totalCount = allItems?.length || 0

  const shoppingList = useMemo(() => buildShoppingList(wishlistItems), [wishlistItems])

  // qty=0 removes from collection (backend handles via PATCH)
  const handleSetCollectionQty = useCallback(async (uuid, qty) => {
    try {
      await setLootCollectionQuantity(uuid, qty)
      refetchCollection()
    } catch (err) {
      console.error('Collection update failed:', err)
    }
  }, [refetchCollection])

  const handleToggleWishlist = useCallback(async (uuid, isWishlisted) => {
    try {
      await toggleLootWishlist(uuid, isWishlisted)
      refetchWishlist()
    } catch (err) {
      console.error('Wishlist toggle failed:', err)
    }
  }, [refetchWishlist])

  // qty=0 removes from wishlist (backend handles via PATCH)
  const handleSetWishlistQty = useCallback(async (uuid, qty) => {
    try {
      await setLootWishlistQuantity(uuid, qty)
      refetchWishlist()
    } catch (err) {
      console.error('Wishlist update failed:', err)
    }
  }, [refetchWishlist])

  const toggleRarity = (r) => setRarities((prev) => {
    const next = new Set(prev)
    next.has(r) ? next.delete(r) : next.add(r)
    return next
  })

  const toggleSource = (s) => setSources((prev) => {
    const next = new Set(prev)
    next.has(s) ? next.delete(s) : next.add(s)
    return next
  })

  if (loading) return <LoadingState message="Loading items..." />
  if (error) return <ErrorState message={error} />

  const wishlistCount = wishlistIds.size

  // Lookup full item from allItems for the detail panel (provides id, manufacturer_name)
  const detailItemMeta = detailUuid ? allItems?.find(i => i.uuid === detailUuid) ?? null : null
  const detailItemId = detailItemMeta?.id ?? null

  return (
    <>
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="ITEM FINDER"
        subtitle={`${totalCount.toLocaleString()} items — find loot, gear, and collectibles`}
        actions={<Search className="w-5 h-5 text-gray-500" />}
      />

      {/* Tab bar (auth only) */}
      {isAuthed && (
        <div className="flex gap-0 border-b border-sc-border">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 text-xs font-display uppercase tracking-wide border-b-2 transition-colors -mb-px ${
              activeTab === 'browse'
                ? 'border-sc-accent text-sc-accent'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setActiveTab('collection')}
            className={`px-4 py-2 text-xs font-display uppercase tracking-wide border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              activeTab === 'collection'
                ? 'border-sc-accent text-sc-accent'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Collection
            {collectionCount > 0 && (
              <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                activeTab === 'collection' ? 'bg-sc-accent/20 text-sc-accent' : 'bg-gray-700 text-gray-400'
              }`}>
                {collectionCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('wishlist')}
            className={`px-4 py-2 text-xs font-display uppercase tracking-wide border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              activeTab === 'wishlist'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Bookmark className="w-3 h-3" />
            Wishlist
            {wishlistCount > 0 && (
              <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                activeTab === 'wishlist' ? 'bg-amber-400/20 text-amber-400' : 'bg-gray-700 text-gray-400'
              }`}>
                {wishlistCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Browse tab ── */}
      {activeTab === 'browse' && (
        <div className="flex gap-4">
          {/* ── Sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-4 w-56 shrink-0">
            {/* Category */}
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Category</p>
              <div className="space-y-0.5">
                <button
                  onClick={() => setCategory('all')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                    category === 'all' ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className="font-display tracking-wide">All</span>
                  <span className="font-mono text-[10px] text-gray-500">{totalCount.toLocaleString()}</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                      category === cat ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-display tracking-wide">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="font-mono text-[10px] text-gray-500">{(categoryCounts[cat] || 0).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Brand */}
            {brands.size > 0 && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Brand</p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {[...brands.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([brandName, count]) => (
                    <button
                      key={brandName}
                      onClick={() => setBrand(brand === brandName ? null : brandName)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                        brand === brandName ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="font-display tracking-wide truncate">{brandName}</span>
                      <span className="font-mono text-[10px] text-gray-500 shrink-0">{count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>

                {/* Set/model sub-filter */}
                {brand && setNames.size > 1 && (
                  <div className="mt-2 ml-2 pl-2 border-l border-sc-border">
                    <p className="text-[10px] font-display uppercase tracking-widest text-gray-600 mb-1.5">Set</p>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {[...setNames.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sn, count]) => (
                        <button
                          key={sn}
                          onClick={() => setSetName(setName === sn ? null : sn)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                            setName === sn ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          <span className="font-display tracking-wide truncate">{sn}</span>
                          <span className="font-mono text-[9px] text-gray-600 shrink-0">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rarity */}
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Rarity</p>
              <div className="space-y-1">
                {RARITY_ORDER.map((r) => {
                  const rs = RARITY_STYLES[r]
                  const active = rarities.has(r)
                  return (
                    <button
                      key={r}
                      onClick={() => toggleRarity(r)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                        active ? 'bg-white/5' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        active ? 'border-sc-accent bg-sc-accent/20' : 'border-gray-600'
                      }`}>
                        {active && <Check className="w-2.5 h-2.5 text-sc-accent" />}
                      </div>
                      <span className={`font-mono ${rs.dot}`}>{rs.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Found in */}
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Found In</p>
              <div className="space-y-1">
                {[
                  { key: 'shops', icon: ShoppingCart, label: 'Shops' },
                  { key: 'containers', icon: Package, label: 'Containers' },
                  { key: 'npcs', icon: Swords, label: 'NPCs' },
                  { key: 'corpses', icon: Skull, label: 'Corpses' },
                  { key: 'contracts', icon: FileText, label: 'Contracts' },
                ].map(({ key, icon: Icon, label }) => {
                  const active = sources.has(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSource(key)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                        active ? 'bg-white/5' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        active ? 'border-sc-accent bg-sc-accent/20' : 'border-gray-600'
                      }`}>
                        {active && <Check className="w-2.5 h-2.5 text-sc-accent" />}
                      </div>
                      <Icon className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-400 font-display tracking-wide">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Collection stats (auth only) */}
            {isAuthed && (
              <div className="border-t border-sc-border pt-4">
                <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Collection</p>
                <p className="text-xs font-mono text-gray-300">
                  {collectionCount.toLocaleString()} / {totalCount.toLocaleString()} collected
                </p>
                <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sc-accent/60 rounded-full transition-all duration-300"
                    style={{ width: totalCount > 0 ? `${(collectionCount / totalCount) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-600 mt-1">
                  {totalCount > 0 ? ((collectionCount / totalCount) * 100).toFixed(1) : 0}%
                </p>
              </div>
            )}
          </aside>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
                className="flex-1 min-w-48"
              />
              <div className="flex items-center gap-1 border border-sc-border rounded p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-400 hover:text-gray-300'}`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-400 hover:text-gray-300'}`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Mobile category tabs */}
            <div className="lg:hidden flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setCategory('all')}
                className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide whitespace-nowrap transition-colors shrink-0 ${
                  category === 'all' ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40' : 'text-gray-400 border border-sc-border'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide whitespace-nowrap transition-colors shrink-0 ${
                    category === cat ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40' : 'text-gray-400 border border-sc-border'
                  }`}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>

            {/* Active filters pills */}
            {(brand || setName) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {brand && (
                  <span className="flex items-center gap-1 text-[10px] font-mono bg-sc-accent/10 border border-sc-accent/30 text-sc-accent px-2 py-0.5 rounded">
                    {brand}
                    <button onClick={() => setBrand(null)} className="hover:text-white ml-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {setName && (
                  <span className="flex items-center gap-1 text-[10px] font-mono bg-sc-accent/10 border border-sc-accent/30 text-sc-accent px-2 py-0.5 rounded">
                    {setName}
                    <button onClick={() => setSetName(null)} className="hover:text-white ml-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Result count */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-500">
                {filtered.length.toLocaleString()} items
                {filtered.length !== totalCount && ` of ${totalCount.toLocaleString()}`}
              </span>
              {totalPages > 1 && (
                <span className="text-xs font-mono text-gray-500">
                  Page {page} / {totalPages}
                </span>
              )}
            </div>

            {/* Grid or list */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                {paged.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    collectionQty={collected.get(item.id) ?? 0}
                    onSetCollectionQty={handleSetCollectionQty}
                    wishlisted={wishlistIds.has(item.id)}
                    onToggleWishlist={handleToggleWishlist}
                    isAuthed={isAuthed}
                    onSelect={setDetailUuid}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-sc-border border border-sc-border rounded">
                {paged.map((item) => {
                  const rs = item.rarity ? rarityStyle(item.rarity) : null
                  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
                  const catLabel = CATEGORY_LABELS[item.category] || item.category
                  const itemCollectionQty = collected.get(item.id) ?? 0
                  const isWishlisted = wishlistIds.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/3 cursor-pointer transition-colors"
                      onClick={() => setDetailUuid(item.uuid)}
                    >
                      <span className={`text-[9px] font-display uppercase px-1.5 py-0.5 rounded w-20 text-center shrink-0 ${catStyle}`}>
                        {catLabel}
                      </span>
                      <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
                      {item.rarity && rs && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge} shrink-0`}>
                          {item.rarity}
                        </span>
                      )}
                      <SourceIcons item={item} />
                      <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
                      {isAuthed && (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleWishlist(item.uuid, isWishlisted)}
                            className={`flex items-center justify-center transition-all duration-150 shrink-0 ${
                              isWishlisted ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {isWishlisted ? <Bookmark className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                          </button>
                          <CollectionStepper
                            qty={itemCollectionQty}
                            onSetQty={(qty) => handleSetCollectionQty(item.uuid, qty)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-500 font-mono text-sm">
                No items found.
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide border border-sc-border text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs font-mono text-gray-500">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide border border-sc-border text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Collection tab ── */}
      {activeTab === 'collection' && isAuthed && (
        <div className="space-y-6">
          {collectedItems.length === 0 ? (
            <div className="text-center py-16 text-gray-500 font-mono text-sm">
              Nothing collected yet. Browse items and use the{' '}
              <Plus className="w-3.5 h-3.5 inline-block mx-0.5" /> button to mark them.
            </div>
          ) : (
            <>
              {/* Overall progress */}
              <div className="panel p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-display uppercase tracking-widest text-gray-500">Overall Progress</p>
                  <span className="text-xs font-mono text-sc-accent">
                    {collectionCount.toLocaleString()} / {totalCount.toLocaleString()} items
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sc-accent/70 rounded-full transition-all duration-500"
                    style={{ width: `${(collectionCount / totalCount) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-500 text-right">
                  {((collectionCount / totalCount) * 100).toFixed(1)}%
                </p>
              </div>

              {/* Per-category breakdown */}
              <div>
                <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3">By Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {['weapon','armour','helmet','clothing','attachment','consumable','harvestable','prop','utility','ship_component','missile'].map(cat => {
                    const s = collectionCategoryStats[cat]
                    if (!s || s.total === 0) return null
                    const pct = (s.collected / s.total) * 100
                    const catStyle = CATEGORY_BADGE_STYLES[cat]
                    return (
                      <button
                        key={cat}
                        onClick={() => setCollCategory(collCategory === cat ? 'all' : cat)}
                        className={`panel p-3 space-y-2 text-left transition-all ${
                          collCategory === cat ? 'border-sc-accent/60' : 'hover:border-sc-border/80'
                        }`}
                      >
                        <span className={`text-[9px] font-display uppercase px-1.5 py-0.5 rounded ${catStyle}`}>
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-sc-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-sc-accent">{s.collected}</span>
                          <span className="text-[10px] font-mono text-gray-600">/ {s.total}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Search + filter */}
              <div className="flex items-center gap-2">
                <SearchInput
                  value={collSearch}
                  onChange={(e) => setCollSearch(e.target.value)}
                  placeholder="Search collection..."
                  className="flex-1"
                />
                {collCategory !== 'all' && (
                  <button
                    onClick={() => setCollCategory('all')}
                    className="flex items-center gap-1 text-[10px] font-mono bg-sc-accent/10 border border-sc-accent/30 text-sc-accent px-2 py-1 rounded"
                  >
                    {CATEGORY_LABELS[collCategory]}
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* Collected items list */}
              <div>
                <p className="text-[10px] font-mono text-gray-500 mb-2">
                  {filteredCollectedItems.length.toLocaleString()} item{filteredCollectedItems.length !== 1 ? 's' : ''}
                  {collSearch || collCategory !== 'all' ? ' matching filters' : ' collected'}
                </p>
                <div className="border border-sc-border rounded overflow-hidden">
                  {filteredCollectedItems.map((item) => {
                    const rs = item.rarity ? rarityStyle(item.rarity) : null
                    const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
                    const catLabel = CATEGORY_LABELS[item.category] || item.category
                    const qty = collected.get(item.id) ?? 0
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2.5 border-b border-sc-border last:border-0 hover:bg-white/3 cursor-pointer transition-colors"
                        onClick={() => setDetailUuid(item.uuid)}
                      >
                        <span className={`text-[9px] font-display uppercase px-1.5 py-0.5 rounded shrink-0 w-20 text-center ${catStyle}`}>
                          {catLabel}
                        </span>
                        <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
                        {item.rarity && rs && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.badge} shrink-0`}>
                            {item.rarity}
                          </span>
                        )}
                        <div onClick={(e) => e.stopPropagation()}>
                          <CollectionStepper
                            qty={qty}
                            onSetQty={(q) => handleSetCollectionQty(item.uuid, q)}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {filteredCollectedItems.length === 0 && (
                    <div className="py-8 text-center text-gray-500 font-mono text-sm">
                      No items match your filters.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Wishlist tab ── */}
      {activeTab === 'wishlist' && isAuthed && (
        <div className="space-y-8">
          {/* Shopping list */}
          {Object.keys(shoppingList).length > 0 && (
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3">Shopping List</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Object.entries(shoppingList).map(([key, { label, icon: Icon, locations }]) => (
                  <div key={key} className="panel p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(locations).map(([loc, items]) => (
                        <div key={loc} className="pl-2 border-l border-sc-border">
                          <p className="text-[10px] font-mono text-gray-400 mb-1">{loc}</p>
                          <ul className="space-y-0.5">
                            {items.map((name, i) => (
                              <li key={i} className="text-xs text-gray-300 font-mono">• {name}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wishlisted items list */}
          {wishlistItems && wishlistItems.length > 0 ? (
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3">
                Wishlisted Items ({wishlistItems.length})
              </p>
              <div className="border border-sc-border rounded overflow-hidden">
                {wishlistItems.map((item) => (
                  <WishlistRow
                    key={item.id}
                    item={item}
                    collectionQty={collected.get(item.id) ?? 0}
                    onSetCollectionQty={handleSetCollectionQty}
                    wishlistQty={wishlistMap.get(item.id) ?? 1}
                    onSetWishlistQty={handleSetWishlistQty}
                    onSelect={setDetailUuid}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500 font-mono text-sm">
              No wishlisted items. Browse items and click the{' '}
              <Bookmark className="w-3.5 h-3.5 inline-block mx-0.5" /> icon to add them.
            </div>
          )}
        </div>
      )}

    </div>
    {/* Detail slide-over — rendered outside animated container to avoid stacking context trap */}
    {detailUuid && (
      <DetailPanel
        uuid={detailUuid}
        manufacturerName={detailItemMeta?.manufacturer_name ?? null}
        collectionQty={collected.get(detailItemId) ?? 0}
        onSetCollectionQty={handleSetCollectionQty}
        wishlisted={wishlistIds.has(detailItemId)}
        onToggleWishlist={handleToggleWishlist}
        isAuthed={isAuthed}
        onClose={() => setDetailUuid(null)}
      />
    )}
    </>
  )
}
