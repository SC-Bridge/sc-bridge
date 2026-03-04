import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Package, Swords, Skull, FileText,
  LayoutGrid, List, X, ChevronRight, Check, Plus, Bookmark, BookmarkPlus
} from 'lucide-react'
import {
  useLoot, useLootCollection, toggleLootCollection,
  useLootWishlist, toggleLootWishlist,
  setLootCollectionQuantity, setLootWishlistQuantity,
} from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import SearchInput from '../../components/SearchInput'
import {
  RARITY_ORDER, RARITY_STYLES, rarityStyle,
  CATEGORY_LABELS, CATEGORY_BADGE_STYLES,
} from '../../lib/lootDisplay'

import { extractSetName, PAGE_SIZE_GRID, PAGE_SIZE_LIST, buildShoppingList } from './lootHelpers'
import SourceIcons from './SourceIcons'
import CollectionStepper from './CollectionStepper'
import ItemCard from './ItemCard'
import DetailPanel from './DetailPanel'
import WishlistRow from './WishlistRow'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LootDB() {
  const { uuid: routeUuid } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const { data: allItems, loading, error, refetch } = useLoot()
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

  const [actionError, setActionError] = useState(null)
  const [activeTab, setActiveTab] = useState('browse')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [brand, setBrand] = useState(null)
  const [setName, setSetName] = useState(null)
  const [rarities, setRarities] = useState(new Set())
  const [sources, setSources] = useState(new Set())
  const [viewMode, setViewMode] = useState('grid')
  const [detailUuid, setDetailUuid] = useState(routeUuid || null)

  // Auto-open detail panel when arriving via /loot/:uuid route
  useEffect(() => {
    if (routeUuid) setDetailUuid(routeUuid)
  }, [routeUuid])
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
      setActionError('Collection update failed: ' + err.message)
      setTimeout(() => setActionError(null), 3000)
    }
  }, [refetchCollection])

  const handleToggleWishlist = useCallback(async (uuid, isWishlisted) => {
    try {
      await toggleLootWishlist(uuid, isWishlisted)
      refetchWishlist()
    } catch (err) {
      setActionError('Wishlist toggle failed: ' + err.message)
      setTimeout(() => setActionError(null), 3000)
    }
  }, [refetchWishlist])

  // qty=0 removes from wishlist (backend handles via PATCH)
  const handleSetWishlistQty = useCallback(async (uuid, qty) => {
    try {
      await setLootWishlistQuantity(uuid, qty)
      refetchWishlist()
    } catch (err) {
      setActionError('Wishlist update failed: ' + err.message)
      setTimeout(() => setActionError(null), 3000)
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
  if (error) return <ErrorState message={error} onRetry={refetch} />

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

      {actionError && (
        <div className="panel p-4 flex items-center gap-2 text-sm animate-fade-in border-sc-danger/30 text-sc-danger">
          {actionError}
        </div>
      )}

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
                onChange={setSearch}
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
                  onChange={setCollSearch}
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
        onClose={() => { setDetailUuid(null); if (routeUuid) navigate('/loot', { replace: true }) }}
      />
    )}
    </>
  )
}
