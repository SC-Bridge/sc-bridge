import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Search, Package, ShoppingCart, Swords, Skull, FileText,
  LayoutGrid, List, X, ChevronRight, Check, Plus, Bookmark, BookmarkPlus
} from 'lucide-react'
import {
  useLoot, useLootItem, useLootCollection, toggleLootCollection,
  useLootWishlist, toggleLootWishlist,
} from '../hooks/useAPI'
import { useSession } from '../lib/auth-client'
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
  weapon:      'Weapon',
  armour:      'Armour',
  helmet:      'Helmet',
  clothing:    'Clothing',
  attachment:  'Attachment',
  consumable:  'Consumable',
  harvestable: 'Harvestable',
  prop:        'Prop',
  utility:     'Utility',
  unknown:     'Other',
}

const CATEGORY_BADGE_STYLES = {
  weapon:      'bg-red-900/40 text-red-300',
  armour:      'bg-blue-900/40 text-blue-300',
  helmet:      'bg-sky-900/40 text-sky-300',
  clothing:    'bg-indigo-900/40 text-indigo-300',
  attachment:  'bg-orange-900/40 text-orange-300',
  consumable:  'bg-green-900/40 text-green-300',
  harvestable: 'bg-teal-900/40 text-teal-300',
  prop:        'bg-gray-700/60 text-gray-300',
  utility:     'bg-yellow-900/40 text-yellow-300',
  unknown:     'bg-gray-700/60 text-gray-400',
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

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, collected, onToggleCollect, wishlisted, onToggleWishlist, isAuthed, onSelect }) {
  const rs = rarityStyle(item.rarity)
  const catStyle = CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
  const catLabel = CATEGORY_LABELS[item.category] || item.category

  return (
    <div
      className={`panel p-3 flex flex-col gap-2 cursor-pointer hover:border-sc-border/80 transition-all duration-150 ${collected ? 'opacity-75' : ''}`}
      onClick={() => onSelect(item.uuid)}
    >
      {/* Top row: category badge + rarity badge */}
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[9px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${catStyle}`}>
          {catLabel}
        </span>
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

      {/* Bottom row: sources + action buttons */}
      <div className="flex items-center justify-between">
        <SourceIcons item={item} />
        {isAuthed && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleWishlist(item.uuid, wishlisted) }}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-150 shrink-0 ${
                wishlisted
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400'
              }`}
              title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              {wishlisted ? <Bookmark className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollect(item.uuid, collected) }}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-150 shrink-0 ${
                collected
                  ? 'bg-sc-accent/20 border-sc-accent/50 text-sc-accent'
                  : 'border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400'
              }`}
              title={collected ? 'Mark uncollected' : 'Mark collected'}
            >
              {collected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Location section renderer ─────────────────────────────────────────────────
function LocationSection({ label, icon: Icon, data }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className="space-y-1">
        {data.map((entry, i) => (
          <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-sc-border">
            {typeof entry === 'string' ? entry : (entry.name || entry.location || JSON.stringify(entry))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail slide-over ─────────────────────────────────────────────────────────
function DetailPanel({ uuid, collected, onToggleCollect, wishlisted, onToggleWishlist, isAuthed, onClose }) {
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
        className="fixed right-0 top-0 h-full w-full sm:w-96 bg-sc-darker border-l border-sc-border z-50 flex flex-col overflow-hidden"
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
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Name + badges */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white leading-tight">{item.name}</h2>
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
                <button
                  onClick={() => onToggleCollect(uuid, collected)}
                  className={`flex-1 py-2 rounded text-xs font-display uppercase tracking-wide border transition-all duration-150 flex items-center justify-center gap-2 ${
                    collected
                      ? 'bg-sc-accent/10 border-sc-accent/40 text-sc-accent'
                      : 'border-sc-border text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {collected ? 'Collected' : 'Mark Collected'}
                </button>
              </div>
            )}

            {/* Item stats from linked table */}
            {item.item_details && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-2">Item Details</p>
                <div className="space-y-1 text-xs font-mono">
                  {item.item_details.description && (
                    <p className="text-gray-400 text-[11px] leading-relaxed">{item.item_details.description}</p>
                  )}
                  {item.item_details.type && item.item_details.type !== item.type && (
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-16 shrink-0">Type</span>
                      <span className="text-gray-300">{item.item_details.type}</span>
                    </div>
                  )}
                  {item.item_details.slot && (
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-16 shrink-0">Slot</span>
                      <span className="text-gray-300">{item.item_details.slot}</span>
                    </div>
                  )}
                  {item.item_details.stats_json && item.item_details.stats_json !== 'null' && (() => {
                    try {
                      const stats = JSON.parse(item.item_details.stats_json)
                      return Object.entries(stats).slice(0, 12).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-gray-500 w-32 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                          <span className="text-gray-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))
                    } catch { return null }
                  })()}
                </div>
              </div>
            )}

            {/* Where to find */}
            {(item.has_shops || item.has_containers || item.has_npcs || item.has_corpses || item.has_contracts) ? (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-gray-500 mb-3">Where to Find</p>
                <div className="space-y-4">
                  <LocationSection label="Shops" icon={ShoppingCart} data={parsedJson('shops_json')} />
                  <LocationSection label="Containers" icon={Package} data={parsedJson('containers_json')} />
                  <LocationSection label="NPCs" icon={Swords} data={parsedJson('npcs_json')} />
                  <LocationSection label="Corpses" icon={Skull} data={parsedJson('corpses_json')} />
                  <LocationSection label="Contracts" icon={FileText} data={parsedJson('contracts_json')} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 font-mono">No location data available.</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Wishlist list row (no card boxes — clean flat list) ───────────────────────
function WishlistRow({ item, collected, onToggleCollect, onToggleWishlist, onSelect }) {
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
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onToggleCollect(item.uuid, collected)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all duration-150 ${
            collected ? 'text-sc-accent' : 'text-gray-600 hover:text-gray-400'
          }`}
          title={collected ? 'Mark uncollected' : 'Mark collected'}
        >
          {collected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onToggleWishlist(item.uuid, true)}
          className="w-6 h-6 rounded flex items-center justify-center text-amber-400 hover:text-amber-200 transition-colors"
          title="Remove from wishlist"
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>
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
  const getLabel = (entry) => typeof entry === 'string' ? entry : (entry.name || entry.location || '?')

  wishlistItems.forEach(item => {
    SOURCE_DEFS.forEach(({ key, label, jsonKey, icon }) => {
      const entries = parseJson(item[jsonKey])
      if (!entries.length) return
      if (!groups[key]) groups[key] = { label, icon, locations: {} }
      // Deduplicate locations within this item's JSON array (same location can appear
      // many times — one per container/NPC instance — which would duplicate item names)
      const uniqueLocs = [...new Set(entries.map(getLabel))]
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

  const collected = useMemo(() => {
    if (!collectionIds) return new Set()
    return new Set(collectionIds)
  }, [collectionIds])

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

  // All categories present in data
  const categories = useMemo(() => {
    if (!allItems) return []
    const seen = new Set(allItems.map((i) => i.category))
    const ordered = ['weapon', 'armour', 'helmet', 'clothing', 'attachment', 'consumable', 'harvestable', 'prop', 'utility', 'unknown']
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

  const collectionCount = collected.size
  const totalCount = allItems?.length || 0

  const shoppingList = useMemo(() => buildShoppingList(wishlistItems), [wishlistItems])

  const handleToggleCollect = useCallback(async (uuid, isCollected) => {
    try {
      await toggleLootCollection(uuid, isCollected)
      refetchCollection()
    } catch (err) {
      console.error('Collection toggle failed:', err)
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

  // Find the wishlisted/collected state for the detail panel item
  const detailItemId = detailUuid ? allItems?.find(i => i.uuid === detailUuid)?.id : null

  return (
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
                    collected={collected.has(item.id)}
                    onToggleCollect={handleToggleCollect}
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
                  const isCollected = collected.has(item.id)
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleWishlist(item.uuid, isWishlisted) }}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-150 shrink-0 ${
                              isWishlisted
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                : 'border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400'
                            }`}
                          >
                            {isWishlisted ? <Bookmark className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleCollect(item.uuid, isCollected) }}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-150 shrink-0 ${
                              isCollected
                                ? 'bg-sc-accent/20 border-sc-accent/50 text-sc-accent'
                                : 'border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400'
                            }`}
                          >
                            {isCollected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
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
                    collected={collected.has(item.id)}
                    onToggleCollect={handleToggleCollect}
                    onToggleWishlist={handleToggleWishlist}
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

      {/* Detail slide-over */}
      {detailUuid && (
        <DetailPanel
          uuid={detailUuid}
          collected={collected.has(detailItemId)}
          onToggleCollect={handleToggleCollect}
          wishlisted={wishlistIds.has(detailItemId)}
          onToggleWishlist={handleToggleWishlist}
          isAuthed={isAuthed}
          onClose={() => setDetailUuid(null)}
        />
      )}
    </div>
  )
}
