import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapPin, Package, ShoppingCart, Swords, ChevronDown, ChevronRight, Store, X } from 'lucide-react'
import { useLootLocations, useAPI } from '../hooks/useAPI'
import { friendlyLocation, friendlyFaction, getLocationGroup, isTemplateLocation } from '../lib/lootLocations'
import { friendlyShopName } from '../lib/shopNames'
import { LOCATION_TREE, assignShopsToTree, countShopsInNode } from '../lib/locationHierarchy'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'
import RenderThumb from '../components/RenderThumb'
import { RARITY_STYLES } from '../lib/lootDisplay'

// ── Location group config ──────────────────────────────────────────────────
const LOCATION_GROUP_CONFIG = {
  named:     { label: 'Named Locations',     order: 0 },
  cave:      { label: 'Caves',               order: 1 },
  outpost:   { label: 'Outposts',            order: 2 },
  dc:        { label: 'Distribution Centres', order: 3 },
  facility:  { label: 'Facilities',          order: 4 },
  contested: { label: 'Contested Zones',     order: 5 },
  station:   { label: 'Stations',            order: 6 },
  derelict:  { label: 'Derelicts',           order: 7 },
  generic:   { label: 'Generic',             order: 8 },
}

const GROUP_KEYS = Object.keys(LOCATION_GROUP_CONFIG)

function RaritySummary({ rarities }) {
  const ordered = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']
  const present = ordered.filter(r => rarities[r])
  if (present.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {present.slice(0, 3).map(r => (
        <span key={r} className={`text-[10px] font-mono ${RARITY_STYLES[r]?.dot || 'text-gray-500'}`}>
          {rarities[r]} {r}
        </span>
      ))}
    </div>
  )
}

// ── Location card ──────────────────────────────────────────────────────────
function LocationCard({ rawKey, friendlyName, itemCount, rarities, linkPrefix }) {
  return (
    <Link
      to={`${linkPrefix}${encodeURIComponent(rawKey)}`}
      className="panel p-4 hover:border-sc-border/80 transition-all duration-150 block"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-xs font-medium text-gray-200 leading-tight line-clamp-2">{friendlyName}</h3>
        <span className="text-[10px] font-mono text-gray-500 shrink-0">{itemCount} items</span>
      </div>
      <RaritySummary rarities={rarities} />
    </Link>
  )
}

// ── Section tabs ───────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'containers', label: 'Loot Locations', icon: Package },
  { key: 'shops',      label: 'Shops',          icon: ShoppingCart },
  { key: 'npcs',       label: 'NPC Factions',   icon: Swords },
]

function PaginatedGrid({ entries, linkPrefix }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(entry => (
        <LocationCard
          key={entry.rawKey}
          rawKey={entry.rawKey}
          friendlyName={entry.friendlyName}
          itemCount={entry.itemCount}
          rarities={entry.rarities}
          linkPrefix={linkPrefix}
        />
      ))}
    </div>
  )
}

// ── Shop type badges ────────────────────────────────────────────────────────
const SHOP_TYPE_BADGE = {
  admin:      'bg-gray-700/60 text-gray-300 border border-gray-600/50',
  weapons:    'bg-red-900/50 text-red-300 border border-red-700/50',
  armor:      'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  clothing:   'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  ships:      'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50',
  food:       'bg-green-900/50 text-green-300 border border-green-700/50',
  mining:     'bg-amber-900/50 text-amber-300 border border-amber-700/50',
  commodity:  'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50',
  general:    'bg-gray-700/60 text-gray-300 border border-gray-600/50',
}

function ShopTreeNode({ node, depth = 0, search, onShopClick }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const shopCount = countShopsInNode(node)
  const hasChildren = node.children?.length > 0
  const hasShops = node.shops?.length > 0

  // When searching, auto-expand to show matches
  const matchingShops = useMemo(() => {
    if (!search || !node.shops) return node.shops || []
    const q = search.toLowerCase()
    return node.shops.filter(s =>
      s.display_name?.toLowerCase().includes(q) ||
      s.location_name?.toLowerCase().includes(q)
    )
  }, [node.shops, search])

  const hasMatchingDescendants = useMemo(() => {
    if (!search) return shopCount > 0
    function checkNode(n) {
      if (n.shops?.some(s =>
        s.display_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.location_name?.toLowerCase().includes(search.toLowerCase())
      )) return true
      return n.children?.some(checkNode) || false
    }
    return checkNode(node)
  }, [node, search, shopCount])

  if (shopCount === 0 && !search) return null
  if (search && !hasMatchingDescendants) return null

  const isExpanded = search ? true : expanded

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-sc-border/30 pl-3' : ''}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1.5 hover:bg-white/3 transition-colors text-left rounded px-1 -mx-1"
      >
        {(hasChildren || hasShops) ? (
          isExpanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <MapPin className={`w-3 h-3 shrink-0 ${depth === 0 ? 'text-sc-accent' : 'text-gray-500'}`} />
        <span className={`text-xs flex-1 ${depth === 0 ? 'font-display font-semibold text-gray-100 uppercase tracking-wide' : 'text-gray-200'}`}>
          {node.name}
        </span>
        <span className="text-[10px] font-mono text-gray-600 shrink-0">
          {shopCount} {shopCount === 1 ? 'shop' : 'shops'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1">
          {hasChildren && node.children.map(child => (
            <ShopTreeNode key={child.name} node={child} depth={depth + 1} search={search} onShopClick={onShopClick} />
          ))}
          {(search ? matchingShops : node.shops || []).map(shop => (
            <Link
              key={shop.id}
              to={`/shops?type=${shop.shop_type || 'all'}`}
              onClick={(e) => { e.preventDefault(); onShopClick(shop) }}
              className="flex items-center gap-2 py-1.5 px-2 ml-4 hover:bg-white/3 transition-colors rounded cursor-pointer"
            >
              <Store className="w-3 h-3 text-gray-600 shrink-0" />
              <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">{shop.display_name}</span>
              <span className={`text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded ${SHOP_TYPE_BADGE[shop.shop_type] || SHOP_TYPE_BADGE.general}`}>
                {shop.shop_type}
              </span>
              <span className="text-[10px] font-mono text-gray-600 shrink-0">{shop.item_count} items</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shop inventory panel (slide-over) ────────────────────────────────────
export function ShopInventoryPanel({ shop, onClose }) {
  const { data: inventory, loading: invLoading } = useAPI(
    `/gamedata/shops/${shop.slug}/inventory`,
    { skip: !shop }
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  const sorted = useMemo(() => {
    if (!inventory) return []
    const named = inventory.filter((i) => i.resolved_name)
    const uuidOnly = inventory.filter((i) => !i.resolved_name)
    named.sort((a, b) => a.resolved_name.localeCompare(b.resolved_name))
    uuidOnly.sort((a, b) => (b.buy_price || b.sell_price || 0) - (a.buy_price || a.sell_price || 0))
    return [...named, ...uuidOnly]
  }, [inventory])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-sc-dark border-l border-sc-border overflow-y-auto animate-fade-in-up">
        <div className="sticky top-0 bg-sc-dark/95 backdrop-blur border-b border-sc-border p-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-white text-sm leading-tight">{shop.display_name}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-display uppercase tracking-wide px-2 py-0.5 rounded ${SHOP_TYPE_BADGE[shop.shop_type] || SHOP_TYPE_BADGE.general}`}>
                {shop.shop_type}
              </span>
              <span className="text-[10px] font-mono text-gray-500">{shop.item_count} items</span>
            </div>
            {shop.location_name && (
              <div className="flex items-center gap-1 mt-1.5">
                <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
                <span className="text-[10px] font-mono text-gray-500">{shop.location_name}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 p-1" aria-label="Close panel">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {invLoading && <div className="text-center py-8 text-gray-500 font-mono text-sm">Loading inventory...</div>}
          {!invLoading && sorted.length === 0 && <div className="text-center py-8 text-gray-500 font-mono text-sm">No items in inventory.</div>}
          {!invLoading && sorted.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-display uppercase tracking-widest text-gray-500">
                <span className="flex-1">Item</span>
                <span className="w-20 text-right">Buy</span>
                <span className="w-20 text-right">Sell</span>
              </div>
              {sorted.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/[0.03] transition-colors">
                  <RenderThumb
                    render={item.render}
                    kind={item.render_variants_kind}
                    itemKey={item.render_item_key}
                    variant={item.render_variant ?? ''}
                    title={item.resolved_name || item.item_uuid}
                  />
                  <span className="flex-1 min-w-0 text-xs font-mono text-gray-200 truncate">
                    {item.resolved_name || item.item_uuid}
                  </span>
                  <span className="w-20 text-right text-xs font-mono text-sc-melt shrink-0">
                    {item.buy_price ? `${Math.round(item.buy_price).toLocaleString()} aUEC` : '--'}
                  </span>
                  <span className="w-20 text-right text-xs font-mono text-green-400 shrink-0">
                    {item.sell_price ? `${Math.round(item.sell_price).toLocaleString()} aUEC` : '--'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 30

export default function POI() {
  const { data, loading, error, refetch } = useLootLocations()
  const { data: allShops, loading: shopsLoading } = useAPI('/gamedata/shops')
  const [selectedShop, setSelectedShop] = useState(null)
  const VALID_SECTIONS = ['containers', 'shops', 'npcs']
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activeSection = VALID_SECTIONS.includes(sectionParam) ? sectionParam : 'containers'
  const search = searchParams.get('q') || ''
  const activeGroup = searchParams.get('group') || 'all'
  const page = parseInt(searchParams.get('page') || '1', 10)

  const setActiveSection = useCallback((section) => {
    setSearchParams(prev => {
      if (section === 'containers') prev.delete('section'); else prev.set('section', section)
      prev.delete('q')
      prev.delete('group')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((value) => {
    setSearchParams(prev => {
      if (value) prev.set('q', value); else prev.delete('q')
      prev.delete('page')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const setActiveGroup = useCallback((group) => {
    setSearchParams(prev => {
      if (group && group !== 'all') prev.set('group', group); else prev.delete('group')
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

  // Containers: grouped by location group
  const containerEntries = useMemo(() => {
    if (!data?.containers) return []
    return data.containers
      .filter((loc) => !isTemplateLocation(loc.key))
      .map((loc) => ({
        rawKey: loc.key,
        friendlyName: friendlyLocation(loc.key),
        group: getLocationGroup(loc.key),
        itemCount: loc.itemCount,
        rarities: loc.rarities || {},
      }))
  }, [data])

  // Shops (loot-system — kept for subtitle count)
  const shopEntries = useMemo(() => {
    if (!data?.shops) return []
    return data.shops.map((loc) => ({
      rawKey: loc.key,
      friendlyName: friendlyShopName(loc.key),
      itemCount: loc.itemCount,
      rarities: loc.rarities || {},
    }))
  }, [data])

  // Shop tree — organized by location hierarchy
  const shopTree = useMemo(() => {
    if (!allShops) return { tree: [], unmatched: [] }
    // Filter out removed locations AND shops with 0 items (F120 — SOC
    // template / generic shops that don't actually stock anything
    // clutter the OTHER group and have no user value).
    const active = allShops.filter(s =>
      !s.location_name?.includes('(Removed)') && (s.item_count || 0) > 0
    )
    return assignShopsToTree(LOCATION_TREE, active)
  }, [allShops])

  // NPCs — server groups by faction and returns loc.name. Fall back to
  // friendlyFaction for safety (e.g. 'unknown' bucket, cached pre-server-fix payloads).
  const npcEntries = useMemo(() => {
    if (!data?.npcs) return []
    return data.npcs.map((loc) => ({
      rawKey: loc.key,
      friendlyName: loc.name || friendlyFaction(loc.key),
      itemCount: loc.itemCount,
      rarities: loc.rarities || {},
    }))
  }, [data])

  // Search + group filter for containers
  const filteredContainers = useMemo(() => {
    let entries = containerEntries
    if (activeGroup !== 'all') {
      entries = entries.filter(e => e.group === activeGroup)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      entries = entries.filter(e => e.friendlyName.toLowerCase().includes(q))
    }
    return entries.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
  }, [containerEntries, activeGroup, search])

  // Search filter for shops
  const filteredShops = useMemo(() => {
    let entries = shopEntries
    if (search.trim()) {
      const q = search.toLowerCase()
      entries = entries.filter(e => e.friendlyName.toLowerCase().includes(q))
    }
    return entries.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
  }, [shopEntries, search])

  // Search filter for NPCs
  const filteredNpcs = useMemo(() => {
    let entries = npcEntries
    if (search.trim()) {
      const q = search.toLowerCase()
      entries = entries.filter(e => e.friendlyName.toLowerCase().includes(q))
    }
    return entries.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
  }, [npcEntries, search])

  // Group counts for container tab
  const groupCounts = useMemo(() => {
    const counts = { all: containerEntries.length }
    for (const entry of containerEntries) {
      counts[entry.group] = (counts[entry.group] || 0) + 1
    }
    return counts
  }, [containerEntries])

  // Grouped rendering for containers
  const groupedContainers = useMemo(() => {
    if (activeGroup !== 'all') return null
    const buckets = new Map()
    for (const entry of filteredContainers) {
      if (!buckets.has(entry.group)) buckets.set(entry.group, [])
      buckets.get(entry.group).push(entry)
    }
    return [...buckets.entries()].sort(([a], [b]) => {
      const ao = LOCATION_GROUP_CONFIG[a]?.order ?? 99
      const bo = LOCATION_GROUP_CONFIG[b]?.order ?? 99
      return ao - bo
    })
  }, [filteredContainers, activeGroup])


  const currentList = activeSection === 'containers' ? filteredContainers
    : activeSection === 'shops' ? filteredShops
    : filteredNpcs
  const totalPages = Math.ceil(currentList.length / PAGE_SIZE)
  const pagedList = currentList.slice(0, page * PAGE_SIZE)

  if (loading) return <LoadingState message="Loading locations..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="LOCATIONS"
        subtitle={`${containerEntries.length} loot locations, ${allShops?.length || shopEntries.length} shops, ${npcEntries.length} factions`}
        actions={<MapPin className="w-5 h-5 text-gray-500" />}
      />

      {/* Section tabs */}
      <div className="flex gap-0 border-b border-sc-border">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`px-4 py-2 text-xs font-display uppercase tracking-wide border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              activeSection === key
                ? 'border-sc-accent text-sc-accent'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={
          activeSection === 'containers' ? 'Search locations...'
          : activeSection === 'shops' ? 'Search shops...'
          : 'Search factions...'
        }
        className="max-w-md"
      />

      {/* Group filter for containers */}
      {activeSection === 'containers' && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveGroup('all')}
            className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide transition-colors ${
              activeGroup === 'all'
                ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/30'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:bg-white/5'
            }`}
          >
            All ({groupCounts.all || 0})
          </button>
          {GROUP_KEYS.filter(k => groupCounts[k]).map(k => (
            <button
              key={k}
              onClick={() => setActiveGroup(k)}
              className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide transition-colors ${
                activeGroup === k
                  ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/30'
                  : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:bg-white/5'
              }`}
            >
              {LOCATION_GROUP_CONFIG[k].label} ({groupCounts[k]})
            </button>
          ))}
        </div>
      )}

      <span className="text-xs font-mono text-gray-500">
        {activeSection === 'containers' ? `${filteredContainers.length} results`
         : activeSection === 'shops' ? `${allShops?.filter(s => !s.location_name?.includes('(Removed)')).length || 0} shops`
         : `${filteredNpcs.length} results`}
      </span>

      {/* ── Containers section ── */}
      {activeSection === 'containers' && (
        <>
          {activeGroup === 'all' && !search.trim() && groupedContainers ? (
            <div className="space-y-6">
              {groupedContainers.map(([groupKey, entries]) => (
                <div key={groupKey}>
                  <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3 pl-1">
                    {LOCATION_GROUP_CONFIG[groupKey]?.label ?? groupKey} ({entries.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {entries.map(entry => (
                      <LocationCard
                        key={entry.rawKey}
                        rawKey={entry.rawKey}
                        friendlyName={entry.friendlyName}
                        itemCount={entry.itemCount}
                        rarities={entry.rarities}
                        linkPrefix="/poi/"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PaginatedGrid entries={pagedList} linkPrefix="/poi/" />
          )}
        </>
      )}

      {/* ── Shops section — hierarchical tree ── */}
      {activeSection === 'shops' && (
        shopsLoading ? (
          <div className="text-center py-8 text-gray-500 font-mono text-sm">Loading shops...</div>
        ) : (
          <div className="space-y-2">
            {shopTree.tree.map(node => (
              <ShopTreeNode key={node.name} node={node} search={search} onShopClick={setSelectedShop} />
            ))}
            {shopTree.unmatched.length > 0 && (
              <ShopTreeNode
                node={{ name: 'Other', shops: shopTree.unmatched, children: [] }}
                search={search}
                onShopClick={setSelectedShop}
              />
            )}
          </div>
        )
      )}

      {/* ── NPCs section ── */}
      {activeSection === 'npcs' && (
        <PaginatedGrid entries={pagedList} linkPrefix="/poi/npc/" />
      )}

      {/* Load more */}
      {(activeSection !== 'containers' || activeGroup !== 'all' || search.trim()) && page < totalPages && (
        <div className="text-center pt-2">
          <button
            onClick={() => setPage(p => p + 1)}
            className="btn-secondary text-xs px-6"
          >
            Show more ({currentList.length - pagedList.length} remaining)
          </button>
        </div>
      )}

      {/* Shop inventory slide-over */}
      {selectedShop && (
        <ShopInventoryPanel shop={selectedShop} onClose={() => setSelectedShop(null)} />
      )}
    </div>
  )
}
