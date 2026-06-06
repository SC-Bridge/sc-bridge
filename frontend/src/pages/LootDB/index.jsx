import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, ShoppingCart, Package, Swords, FileText, MapPin,
  LayoutGrid, List, X, ChevronRight, ChevronDown, Check, Plus, Bookmark, BookmarkPlus,
  ArrowUpDown, ChevronsUpDown, ChevronsDownUp,
  CheckCircle2, Layers,
} from 'lucide-react'
import {
  useLoot, useLootCollection, toggleLootCollection,
  useLootWishlist, toggleLootWishlist, useLootCrafted,
  setLootCollectionQuantity, setLootWishlistQuantity,
} from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import SearchInput from '../../components/SearchInput'
import StatCard from '../../components/StatCard'
import CategoryStrip from './CategoryStrip'
import {
  RARITY_ORDER, RARITY_STYLES, rarityStyle,
  CATEGORY_LABELS, CATEGORY_BADGE_STYLES, effectiveCategory,
  humanizeRawDisplayName,
} from '../../lib/lootDisplay'

import {
  extractSetName, PAGE_SIZE_GRID, PAGE_SIZE_LIST,
  buildShoppingList, groupWishlistItems, groupWishlistByLocation, getPrimarySource, SOURCE_DEFS,
  matchesShowFilter,
} from './lootHelpers'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'
import ItemCard from './ItemCard'
import DetailPanel from './DetailPanel'
import MultiFilterStrip from './MultiFilterStrip'
import useMultiFilters from './useMultiFilters'
import WishlistRow from './WishlistRow'

// ── Sort options ────────────────────────────────────────────────────────────
const BASE_SORT_OPTIONS = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
]

const WEAPON_SORT_OPTIONS = [
  { value: 'dps', label: 'DPS' },
  { value: 'range', label: 'Range' },
  { value: 'rpm', label: 'Fire Rate' },
]

const ARMOUR_SORT_OPTIONS = [
  { value: 'resist', label: 'Resistance' },
]

function getSortOptions(category) {
  const extra = []
  if (category === 'weapon' || category === 'ship_weapon') extra.push(...WEAPON_SORT_OPTIONS)
  if (category === 'armour' || category === 'helmet') extra.push(...ARMOUR_SORT_OPTIONS)
  return [...BASE_SORT_OPTIONS, ...extra]
}

// ── Show filter labels ──────────────────────────────────────────────────────
const SHOW_OPTIONS = [
  { value: 'all', label: 'All Items' },
  { value: 'collected', label: 'Collected' },
  { value: 'uncollected', label: 'Uncollected' },
  { value: 'wishlisted', label: 'Wishlisted' },
  { value: 'crafted', label: 'Crafted' },
]

// ── Shopping List Modal ─────────────────────────────────────────────────────
function ShoppingListModal({ shoppingList, onClose }) {
  const entries = Object.entries(shoppingList)
  if (!entries.length) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative panel max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-display uppercase tracking-widest text-amber-400">Shopping List</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {entries.map(([key, { label, icon: Icon, locations }]) => {
          const locEntries = Object.entries(locations).sort((a, b) => b[1].length - a[1].length)
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] font-display uppercase tracking-wider text-gray-400">{label}</span>
                <span className="text-[10px] font-mono text-gray-600 ml-auto">
                  {locEntries.length} location{locEntries.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                {locEntries.map(([loc, items]) => (
                  <div key={loc} className="flex items-center justify-between py-1 border-t border-sc-border/50">
                    <span className="text-xs text-gray-300 truncate mr-2">{loc}</span>
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">
                      {[...new Set(items)].length}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LootDB() {
  const { uuid: routeUuid } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const { data: allItems, loading, error, refetch } = useLoot()
  const { data: collectionIds, refetch: refetchCollection } = useLootCollection(isAuthed)
  const { data: wishlistItems, refetch: refetchWishlist } = useLootWishlist(isAuthed)
  const { data: craftedMap } = useLootCrafted(isAuthed)

  // Map<loot_uuid, quantity> — uuid-keyed since 0225 so the lookup
  // works across LIVE and PTU channels (loot_map ids differ between
  // tables; uuid is stable).
  const collected = useMemo(() => {
    if (!collectionIds) return new Map()
    return new Map(collectionIds.map(e => [e.loot_uuid, e.quantity]))
  }, [collectionIds])

  // Map<loot_uuid, wishlist_quantity>
  const wishlistMap = useMemo(
    () => new Map(wishlistItems?.map(i => [i.uuid, i.wishlist_quantity ?? 1]) ?? []),
    [wishlistItems]
  )
  const wishlistIds = useMemo(
    () => new Set(wishlistItems?.map(i => i.uuid) ?? []),
    [wishlistItems]
  )

  const [actionError, setActionError] = useState(null)
  const actionErrorTimer = useRef(null)

  useEffect(() => () => clearTimeout(actionErrorTimer.current), [])

  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('q') || ''
  // F111: accept both ?category= (canonical) and legacy ?cat= for backward compat.
  const category = searchParams.get('category') || searchParams.get('cat') || 'all'
  const brand = searchParams.get('brand') || null
  const setName = searchParams.get('set') || null
  const raritiesParam = searchParams.get('rarities') || ''
  const rarities = useMemo(() => raritiesParam ? new Set(raritiesParam.split(',')) : new Set(), [raritiesParam])
  const sourcesParam = searchParams.get('sources') || ''
  const sources = useMemo(() => sourcesParam ? new Set(sourcesParam.split(',')) : new Set(), [sourcesParam])
  const viewMode = searchParams.get('view') || 'grid'
  const sortBy = searchParams.get('sort') || 'name'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const show = searchParams.get('show') || 'all'

  const setSearch = useCallback((value) => {
    setSearchParams(prev => {
      if (value) prev.set('q', value); else prev.delete('q')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setCategory = useCallback((value) => {
    setSearchParams(prev => {
      prev.delete('cat') // legacy key — remove if present
      if (value && value !== 'all') prev.set('category', value); else prev.delete('category')
      prev.delete('brand')
      prev.delete('set')
      prev.delete('sub')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setBrand = useCallback((value) => {
    setSearchParams(prev => {
      if (value) prev.set('brand', value); else prev.delete('brand')
      prev.delete('set')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setSetName = useCallback((value) => {
    setSearchParams(prev => {
      if (value) prev.set('set', value); else prev.delete('set')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setViewMode = useCallback((value) => {
    setSearchParams(prev => {
      if (value && value !== 'grid') prev.set('view', value); else prev.delete('view')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setSortBy = useCallback((value) => {
    setSearchParams(prev => {
      if (value && value !== 'name') prev.set('sort', value); else prev.delete('sort')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setPage = useCallback((updater) => {
    setSearchParams(prev => {
      const current = parseInt(prev.get('page') || '1', 10)
      const next = typeof updater === 'function' ? updater(current) : updater
      if (next <= 1) prev.delete('page'); else prev.set('page', String(next))
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setShow = useCallback((value) => {
    setSearchParams(prev => {
      if (value && value !== 'all') prev.set('show', value); else prev.delete('show')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const [detailUuid, setDetailUuid] = useState(routeUuid || null)
  const [showShoppingList, setShowShoppingList] = useState(false)

  // Multi-dimensional sub-filters (per-category)
  const { dimensions: filterDimensions, includes: filterIncludes, excludes: filterExcludes, toggle: toggleFilter, clearAll: clearAllDimFilters, hasAny: hasAnyDimFilters } = useMultiFilters(category)

  // Auto-open detail panel when arriving via /loot/:uuid route
  useEffect(() => {
    if (routeUuid) setDetailUuid(routeUuid)
  }, [routeUuid])

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!allItems) return {}
    const counts = {}
    for (const item of allItems) {
      const cat = effectiveCategory(item)
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [allItems])

  // All categories present in data
  const categories = useMemo(() => {
    if (!allItems) return []
    const seen = new Set(allItems.map((i) => effectiveCategory(i)))
    const ordered = ['weapon', 'armour', 'helmet', 'clothing', 'attachment', 'consumable', 'harvestable', 'prop', 'utility', 'ship_weapon', 'ship_component', 'missile', 'unknown']
    return ordered.filter((c) => seen.has(c))
  }, [allItems])

  // Brand counts (scoped to current category)
  const brands = useMemo(() => {
    if (!allItems) return new Map()
    const map = new Map()
    const base = category !== 'all' ? allItems.filter(i => effectiveCategory(i) === category) : allItems
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
    if (category !== 'all') base = base.filter(i => effectiveCategory(i) === category)
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
      items = items.filter((i) => effectiveCategory(i) === category)
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
        if (sources.has('contracts') && i.has_contracts) return true
        return false
      })
    }

    // Multi-dimensional sub-filters
    if (category !== 'all' && filterDimensions.length > 0) {
      for (const dim of filterDimensions) {
        const inc = filterIncludes[dim.key]
        const exc = filterExcludes[dim.key]
        if (!inc?.size && !exc?.size) continue

        items = items.filter((item) => {
          const raw = item[dim.field]
          const vals = dim.multiValue && typeof raw === 'string'
            ? raw.split(',').map(s => s.trim())
            : raw != null ? [String(raw)] : []

          if (exc?.size && vals.some(v => exc.has(v))) return false
          if (inc?.size && !vals.some(v => inc.has(v))) return false
          return true
        })
      }
    }

    // Show filter (collection/wishlist/crafted overlay). Crafted items count as
    // owned, so 'collected' includes them and 'uncollected' excludes them (#92).
    if (show !== 'all') {
      items = items.filter((i) => matchesShowFilter(i, show, { collected, wishlistIds, craftedMap }))
    }

    if (search.trim()) {
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
      items = items.filter((i) => {
        const name = i.name.toLowerCase()
        const type = i.type ? i.type.toLowerCase() : ''
        const subType = i.sub_type ? i.sub_type.toLowerCase() : ''
        const mfr = i.manufacturer_name ? i.manufacturer_name.toLowerCase() : ''
        const haystack = `${name} ${type} ${subType} ${mfr}`
        return tokens.every((t) => haystack.includes(t))
      })
    }

    // Sort
    const rarityRank = { Legendary: 0, Epic: 1, Rare: 2, Uncommon: 3, Common: 4, 'N/A': 5 }
    if (sortBy === 'rarity') {
      items.sort((a, b) => (rarityRank[a.rarity] ?? 5) - (rarityRank[b.rarity] ?? 5) || a.name.localeCompare(b.name))
    } else if (sortBy === 'category') {
      items.sort((a, b) => (effectiveCategory(a)).localeCompare(effectiveCategory(b)) || a.name.localeCompare(b.name))
    } else if (sortBy === 'brand') {
      items.sort((a, b) => (a.manufacturer_name || '').localeCompare(b.manufacturer_name || '') || a.name.localeCompare(b.name))
    } else if (sortBy === 'dps') {
      items.sort((a, b) => (b.dps || 0) - (a.dps || 0) || a.name.localeCompare(b.name))
    } else if (sortBy === 'range') {
      items.sort((a, b) => (b.effective_range || 0) - (a.effective_range || 0) || a.name.localeCompare(b.name))
    } else if (sortBy === 'rpm') {
      items.sort((a, b) => (b.rounds_per_minute || 0) - (a.rounds_per_minute || 0) || a.name.localeCompare(b.name))
    } else if (sortBy === 'resist') {
      // Sort by average resist (lower multiplier = more resistant, so ascending)
      const avgResist = (i) => {
        const vals = [i.resist_physical, i.resist_energy, i.resist_distortion].filter(v => v != null)
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 999
      }
      items.sort((a, b) => avgResist(a) - avgResist(b) || a.name.localeCompare(b.name))
    } else {
      items.sort((a, b) => a.name.localeCompare(b.name))
    }

    return items
  }, [allItems, category, brand, setName, rarities, sources, search, sortBy, show, filterDimensions, filterIncludes, filterExcludes, collected, wishlistIds, craftedMap])

  const pageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const collectionCount = collected.size  // unique items collected (not sum of quantities)
  const totalCount = allItems?.length || 0

  const shoppingList = useMemo(() => buildShoppingList(wishlistItems), [wishlistItems])

  const wishlistCount = wishlistIds.size

  // Per-category collection stats: { weapon: { total, collected }, ... }
  const collectionCategoryStats = useMemo(() => {
    if (!allItems) return {}
    const stats = {}
    for (const item of allItems) {
      const cat = effectiveCategory(item)
      if (!stats[cat]) stats[cat] = { total: 0, collected: 0 }
      stats[cat].total++
      if (collected.has(item.uuid)) stats[cat].collected++
    }
    return stats
  }, [allItems, collected])

  // qty=0 removes from collection (backend handles via PATCH)
  const handleSetCollectionQty = useCallback(async (uuid, qty) => {
    try {
      await setLootCollectionQuantity(uuid, qty)
      refetchCollection()
    } catch (err) {
      setActionError('Collection update failed: ' + err.message)
      clearTimeout(actionErrorTimer.current)
      actionErrorTimer.current = setTimeout(() => setActionError(null), 3000)
    }
  }, [refetchCollection])

  const handleToggleWishlist = useCallback(async (uuid, isWishlisted) => {
    try {
      await toggleLootWishlist(uuid, isWishlisted)
      refetchWishlist()
    } catch (err) {
      setActionError('Wishlist toggle failed: ' + err.message)
      clearTimeout(actionErrorTimer.current)
      actionErrorTimer.current = setTimeout(() => setActionError(null), 3000)
    }
  }, [refetchWishlist])

  // qty=0 removes from wishlist (backend handles via PATCH)
  const handleSetWishlistQty = useCallback(async (uuid, qty) => {
    try {
      await setLootWishlistQuantity(uuid, qty)
      refetchWishlist()
    } catch (err) {
      setActionError('Wishlist update failed: ' + err.message)
      clearTimeout(actionErrorTimer.current)
      actionErrorTimer.current = setTimeout(() => setActionError(null), 3000)
    }
  }, [refetchWishlist])

  const toggleRarity = (r) => {
    setSearchParams(prev => {
      const current = prev.get('rarities') ? new Set(prev.get('rarities').split(',')) : new Set()
      current.has(r) ? current.delete(r) : current.add(r)
      if (current.size > 0) prev.set('rarities', [...current].join(',')); else prev.delete('rarities')
      prev.delete('page')
      return prev
    }, { replace: true })
  }

  const toggleSource = (s) => {
    setSearchParams(prev => {
      const current = prev.get('sources') ? new Set(prev.get('sources').split(',')) : new Set()
      current.has(s) ? current.delete(s) : current.add(s)
      if (current.size > 0) prev.set('sources', [...current].join(',')); else prev.delete('sources')
      prev.delete('page')
      return prev
    }, { replace: true })
  }

  const clearAllFilters = useCallback(() => {
    setSearchParams(prev => {
      prev.delete('cat')
      prev.delete('category')
      prev.delete('brand')
      prev.delete('set')
      prev.delete('rarities')
      prev.delete('sources')
      prev.delete('show')
      prev.delete('q')
      prev.delete('page')
      // Clear all f_*/fx_* dimension filters
      for (const key of [...prev.keys()]) {
        if (key.startsWith('f_') || key.startsWith('fx_')) prev.delete(key)
      }
      return prev
    }, { replace: true })
    clearAllDimFilters()
  }, [setSearchParams, clearAllDimFilters])

  if (loading) return <LoadingState message="Loading items..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  // Lookup full item from allItems for the detail panel (provides id, manufacturer_name)
  const detailItemMeta = detailUuid ? allItems?.find(i => i.uuid === detailUuid) ?? null : null
  const detailItemId = detailItemMeta?.id ?? null

  // Active filter tag checks
  const hasActiveFilters = category !== 'all' || brand || setName || hasAnyDimFilters || rarities.size > 0 || sources.size > 0 || show !== 'all'

  // Current sort options based on selected category
  const sortOptions = getSortOptions(category)

  return (
    <>
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="ITEM FINDER"
        subtitle={`${totalCount.toLocaleString()} items — find loot, gear, and collectibles`}
        actions={<Search className="w-5 h-5 text-gray-500" />}
      />

      {actionError && (
        <div className="panel p-4 flex items-center gap-2 text-sm animate-fade-in border-sc-danger/30 text-sc-danger">
          {actionError}
        </div>
      )}

      {/* StatCards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Package}
          label="Total Items"
          value={totalCount.toLocaleString()}
        />
        <StatCard
          icon={Layers}
          label="Categories"
          value={categories.length}
        />
        {isAuthed && (
          <div className="stat-card hover:border-sc-accent/20 hover:-translate-y-0.5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-sc-accent" />
              <span className="stat-label">Collected</span>
            </div>
            <span className="stat-value text-sc-accent">{collectionCount.toLocaleString()} <span className="text-gray-500 text-xs font-mono">/ {totalCount.toLocaleString()}</span></span>
            <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sc-accent/60 rounded-full transition-all duration-300"
                style={{ width: totalCount > 0 ? `${(collectionCount / totalCount) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}
        {isAuthed && (
          <div
            className="stat-card hover:border-sc-accent/20 hover:-translate-y-0.5 cursor-pointer"
            onClick={() => wishlistCount > 0 && setShowShoppingList(true)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span className="stat-label">Wishlist</span>
            </div>
            <span className="stat-value text-amber-400">{wishlistCount.toLocaleString()}</span>
            {wishlistCount > 0 && Object.keys(shoppingList).length > 0 && (
              <p className="text-[10px] font-mono text-gray-500 mt-1">Click for shopping list</p>
            )}
          </div>
        )}
      </div>

      {/* CategoryStrip */}
      <CategoryStrip
        categories={categories}
        counts={categoryCounts}
        active={category}
        onSelect={setCategory}
      />

      {/* Main layout: sidebar + content */}
      <div className="flex gap-4">
        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col gap-4 w-56 shrink-0">
          {/* Show filter (auth only) */}
          {isAuthed && (
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Show</p>
              <div className="space-y-0.5">
                {SHOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setShow(opt.value)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                      show === opt.value ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${
                      show === opt.value ? 'border-sc-accent bg-sc-accent' : 'border-gray-600'
                    }`}>
                      {show === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-sc-darker" />}
                    </div>
                    <span className="font-display tracking-wide">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                        <span className="font-mono text-[10px] text-gray-600 shrink-0">{count}</span>
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
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search items..."
              className="flex-1 min-w-48"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-sc-accent font-display tracking-wide"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
            {/* Shopping List button (auth + has wishlist) */}
            {isAuthed && wishlistCount > 0 && Object.keys(shoppingList).length > 0 && (
              <button
                onClick={() => setShowShoppingList(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-display uppercase tracking-wide border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Shopping List</span>
              </button>
            )}
          </div>

          {/* Multi-dimensional sub-filters */}
          {category !== 'all' && filterDimensions.length > 0 && (
            <MultiFilterStrip
              dimensions={filterDimensions}
              items={allItems?.filter(i => effectiveCategory(i) === category) || []}
              includes={filterIncludes}
              excludes={filterExcludes}
              onToggle={toggleFilter}
            />
          )}

          {/* Active filter tags */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">Filtered:</span>
              {category !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
                  {CATEGORY_LABELS[category] || category}
                  <button onClick={() => setCategory('all')} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {brand && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
                  {brand}
                  <button onClick={() => setBrand(null)} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {setName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
                  {setName}
                  <button onClick={() => setSetName(null)} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {[...rarities].map((r) => (
                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {r}
                  <button onClick={() => toggleRarity(r)} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
              {[...sources].map((s) => {
                const srcDef = SOURCE_DEFS.find(d => d.key === s)
                return (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {srcDef?.label || s}
                    <button onClick={() => toggleSource(s)} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                  </span>
                )
              })}
              {filterDimensions.map(dim => {
                const inc = filterIncludes[dim.key]
                const exc = filterExcludes[dim.key]
                if (!inc?.size && !exc?.size) return null
                const labels = dim.values || {}
                return [
                  ...(inc ? [...inc].map(v => (
                    <span key={`inc-${dim.key}-${v}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
                      {labels[v] || v}
                      <button onClick={(e) => toggleFilter(dim.key, v, { shiftKey: true })} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  )) : []),
                  ...(exc ? [...exc].map(v => (
                    <span key={`exc-${dim.key}-${v}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20 line-through">
                      {labels[v] || v}
                      <button onClick={(e) => toggleFilter(dim.key, v, { ctrlKey: true })} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  )) : []),
                ]
              })}
              {show !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {SHOW_OPTIONS.find(o => o.value === show)?.label || show}
                  <button onClick={() => setShow('all')} className="hover:text-white ml-1"><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear all</button>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {paged.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  collectionQty={collected.get(item.uuid) ?? 0}
                  craftedQty={craftedMap?.[item.uuid] ?? 0}
                  onSetCollectionQty={handleSetCollectionQty}
                  wishlisted={wishlistIds.has(item.uuid)}
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
                const eCat = effectiveCategory(item)
                const catStyle = CATEGORY_BADGE_STYLES[eCat] || CATEGORY_BADGE_STYLES.unknown
                const catLabel = CATEGORY_LABELS[eCat] || eCat
                const itemCollectionQty = collected.get(item.uuid) ?? 0
                const itemCraftedQty = craftedMap?.[item.uuid] ?? 0
                const isWishlisted = wishlistIds.has(item.uuid)
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/3 cursor-pointer transition-colors"
                    onClick={() => setDetailUuid(item.uuid)}
                  >
                    {/* Collected indicator */}
                    {isAuthed && itemCollectionQty > 0 && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-sc-accent shrink-0" />
                    )}
                    <span className={`text-[10px] font-display uppercase px-1.5 py-0.5 rounded w-20 text-center shrink-0 ${catStyle}`}>
                      {catLabel}
                    </span>
                    <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{humanizeRawDisplayName(item.name)}</span>
                    {item.rarity && rs && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${rs.badge} shrink-0`}>
                        {item.rarity}
                      </span>
                    )}
                    {isAuthed && itemCraftedQty > 0 && (
                      <span
                        className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90 shrink-0"
                        title={`${itemCraftedQty} crafted via My Blueprints`}
                      >
                        <Package className="w-3 h-3" />
                        {itemCraftedQty}
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

    </div>
    {/* Shopping list modal */}
    {showShoppingList && Object.keys(shoppingList).length > 0 && (
      <ShoppingListModal shoppingList={shoppingList} onClose={() => setShowShoppingList(false)} />
    )}
    {/* Detail slide-over — rendered outside animated container to avoid stacking context trap */}
    {detailUuid && (
      <DetailPanel
        uuid={detailUuid}
        manufacturerName={detailItemMeta?.manufacturer_name ?? null}
        collectionQty={collected.get(detailUuid) ?? 0}
        craftedQty={craftedMap?.[detailUuid] ?? 0}
        onSetCollectionQty={handleSetCollectionQty}
        wishlisted={wishlistIds.has(detailUuid)}
        onToggleWishlist={handleToggleWishlist}
        isAuthed={isAuthed}
        onClose={() => { setDetailUuid(null); if (routeUuid) navigate('/loot', { replace: true }) }}
      />
    )}
    </>
  )
}
