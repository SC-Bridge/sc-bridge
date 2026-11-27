import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAPI } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'
import RenderThumb from '../components/RenderThumb'
import { ShoppingCart, Package, X, MapPin } from 'lucide-react'

// ── Shop type tabs ────────────────────────────────────────────────────────
const TYPE_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'admin',     label: 'Admin' },
  { key: 'weapons',   label: 'Weapons' },
  { key: 'armor',     label: 'Armor' },
  { key: 'clothing',  label: 'Clothing' },
  { key: 'ships',     label: 'Ships' },
  { key: 'food',      label: 'Food' },
  { key: 'mining',    label: 'Mining' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'general',   label: 'General' },
  { key: 'event',     label: 'Event' },
]

const TYPE_BADGE = {
  admin:      'bg-gray-700/60 text-gray-300 border border-gray-600/50',
  weapons:    'bg-red-900/50 text-red-300 border border-red-700/50',
  armor:      'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  clothing:   'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  ships:      'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50',
  food:       'bg-green-900/50 text-green-300 border border-green-700/50',
  mining:     'bg-amber-900/50 text-amber-300 border border-amber-700/50',
  commodity:  'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50',
  general:    'bg-gray-700/60 text-gray-300 border border-gray-600/50',
  event_sale: 'bg-pink-900/50 text-pink-300 border border-pink-700/50',
}

function typeBadgeClass(shopType) {
  return TYPE_BADGE[shopType] || 'bg-gray-700/60 text-gray-400 border border-gray-600/50'
}

function formatPrice(price) {
  if (price == null || price === 0) return null
  return Math.round(price).toLocaleString()
}

/** Sort inventory: named items first (alpha), then UUID-only items by price desc */
function sortInventory(items) {
  if (!items) return []
  const named = items.filter((i) => i.resolved_name)
  const uuidOnly = items.filter((i) => !i.resolved_name)
  named.sort((a, b) => a.resolved_name.localeCompare(b.resolved_name))
  uuidOnly.sort((a, b) => (b.buy_price || b.sell_price || 0) - (a.buy_price || a.sell_price || 0))
  return [...named, ...uuidOnly]
}

// ── Inventory slide-over panel ────────────────────────────────────────────
export function InventoryPanel({ shop, onClose }) {
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

  const sorted = useMemo(() => sortInventory(inventory), [inventory])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-sc-dark border-l border-sc-border overflow-y-auto animate-fade-in-up">
        {/* Header */}
        <div className="sticky top-0 bg-sc-dark/95 backdrop-blur border-b border-sc-border p-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-white text-sm leading-tight">
              {shop.display_name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-display uppercase tracking-wide px-2 py-0.5 rounded ${typeBadgeClass(shop.shop_type)}`}>
                {shop.shop_type}
              </span>
              <span className="text-[10px] font-mono text-gray-500">
                {shop.item_count} items
              </span>
            </div>
            {shop.location_name && (
              <div className="flex items-center gap-1 mt-1.5">
                <MapPin className={`w-3 h-3 shrink-0 ${shop.location_name.includes('(Removed)') ? 'text-gray-600' : 'text-gray-500'}`} />
                <span className={`text-[10px] font-mono ${shop.location_name.includes('(Removed)') ? 'text-gray-600 line-through' : 'text-gray-500'}`}>
                  {shop.location_name}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 p-1"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inventory list */}
        <div className="p-4">
          {invLoading && (
            <div className="text-center py-8 text-gray-500 font-mono text-sm">
              Loading inventory...
            </div>
          )}

          {!invLoading && sorted.length === 0 && (
            <div className="text-center py-8 text-gray-500 font-mono text-sm">
              No items in inventory.
            </div>
          )}

          {!invLoading && sorted.length > 0 && (
            <div className="space-y-1">
              {/* Column header */}
              <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-display uppercase tracking-widest text-gray-500">
                <span className="flex-1">Item</span>
                <span className="w-20 text-right">Buy</span>
                <span className="w-20 text-right">Sell</span>
                <span className="w-14 text-right">Base</span>
                <span className="w-14 text-right">Max</span>
              </div>

              {sorted.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/[0.03] transition-colors"
                >
                  <RenderThumb
                    render={item.render}
                    kind={item.render_variants_kind}
                    itemKey={item.render_item_key}
                    variant={item.render_variant ?? ''}
                    title={item.resolved_name || item.item_uuid}
                  />
                  <div className="flex-1 min-w-0">
                    {item.resolved_name ? (
                      <span className="text-xs font-mono text-gray-200 truncate block">
                        {item.resolved_name}
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-gray-500 truncate block">
                        {item.item_uuid}
                      </span>
                    )}
                  </div>
                  <span className="w-20 text-right text-xs font-mono text-sc-melt shrink-0">
                    {formatPrice(item.buy_price) ? `${formatPrice(item.buy_price)} aUEC` : '--'}
                  </span>
                  <span className="w-20 text-right text-xs font-mono text-green-400 shrink-0">
                    {formatPrice(item.sell_price) ? `${formatPrice(item.sell_price)} aUEC` : '--'}
                  </span>
                  <span className="w-14 text-right text-xs font-mono text-gray-400 shrink-0">
                    {item.base_inventory ?? '--'}
                  </span>
                  <span className="w-14 text-right text-xs font-mono text-gray-400 shrink-0">
                    {item.max_inventory ?? '--'}
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

// ── Shop card ─────────────────────────────────────────────────────────────
function ShopCard({ shop, onClick }) {
  return (
    <button
      onClick={() => onClick(shop)}
      className="panel p-4 text-left hover:border-sc-border/80 transition-all duration-150 w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display font-semibold text-white text-sm leading-tight">
          {shop.display_name}
        </h3>
        <span className="text-[10px] font-mono text-gray-500 shrink-0">
          {shop.item_count} items
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-display uppercase tracking-wide px-2 py-0.5 rounded ${typeBadgeClass(shop.shop_type)}`}>
          {shop.shop_type}
        </span>
        {shop.is_event === 1 && (
          <span className="text-[10px] font-display uppercase tracking-wide px-2 py-0.5 rounded bg-pink-900/50 text-pink-300 border border-pink-700/50">
            Event
          </span>
        )}
      </div>
      {shop.location_name && (
        <div className="flex items-center gap-1 mt-2">
          <MapPin className={`w-3 h-3 shrink-0 ${shop.location_name.includes('(Removed)') ? 'text-gray-600' : 'text-gray-500'}`} />
          <span className={`text-[10px] font-mono ${shop.location_name.includes('(Removed)') ? 'text-gray-600 line-through' : 'text-gray-500'}`}>
            {shop.location_name}
          </span>
        </div>
      )}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
const INITIAL_COUNT = 30

export default function Shops() {
  const { data: shops, loading, error, refetch } = useAPI('/gamedata/shops')
  const VALID_TYPES = TYPE_TABS.map(t => t.key)
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const typeTab = VALID_TYPES.includes(typeParam) ? typeParam : 'all'
  const search = searchParams.get('q') || ''
  const locationFilter = searchParams.get('loc') || 'all'
  const setTypeTab = useCallback((t) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (t === 'all') next.delete('type')
      else next.set('type', t)
      return next
    }, { replace: true })
  }, [setSearchParams])
  const setSearch = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (val) next.set('q', val)
      else next.delete('q')
      return next
    }, { replace: true })
  }, [setSearchParams])
  const setLocationFilter = useCallback((val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (val === 'all') next.delete('loc')
      else next.set('loc', val)
      return next
    }, { replace: true })
  }, [setSearchParams])
  const [selectedShop, setSelectedShop] = useState(null)
  const [showAll, setShowAll] = useState(false)

  // Derive unique locations from shop data
  const locations = useMemo(() => {
    if (!shops) return []
    const locs = [...new Set(shops.filter(s => s.location_name).map(s => s.location_name))].sort()
    return locs
  }, [shops])

  const filtered = useMemo(() => {
    if (!shops) return []
    let items = shops

    // Type filter
    if (typeTab !== 'all') {
      if (typeTab === 'event') {
        items = items.filter((s) => s.is_event === 1)
      } else {
        items = items.filter((s) => s.shop_type === typeTab)
      }
    }

    // Location filter
    if (locationFilter === 'unlocated') {
      items = items.filter((s) => !s.location_name)
    } else if (locationFilter !== 'all') {
      items = items.filter((s) => s.location_name === locationFilter)
    }

    // Search — match on display_name or location_name
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((s) =>
        s.display_name.toLowerCase().includes(q) ||
        (s.location_name && s.location_name.toLowerCase().includes(q))
      )
    }

    // Sort: shops with locations first (alpha), then unlocated shops (alpha)
    return items.sort((a, b) => {
      const aHasLoc = a.location_name ? 0 : 1
      const bHasLoc = b.location_name ? 0 : 1
      if (aHasLoc !== bHasLoc) return aHasLoc - bHasLoc
      return a.display_name.localeCompare(b.display_name)
    })
  }, [shops, typeTab, locationFilter, search])

  // Reset pagination when filters change
  React.useEffect(() => { setShowAll(false) }, [typeTab, locationFilter, search])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_COUNT)
  const hasMore = !showAll && filtered.length > INITIAL_COUNT

  if (loading) return <LoadingState message="Loading shops..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="SHOPS"
        subtitle={`${shops?.length || 0} shops across the verse`}
        actions={<ShoppingCart className="w-5 h-5 text-gray-500" />}
      />

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeTab(tab.key)}
            className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide transition-all duration-150 ${
              typeTab === tab.key
                ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Location filter */}
      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setLocationFilter('all')}
            className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide transition-all duration-150 ${
              locationFilter === 'all'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:border-gray-600'
            }`}
          >
            All Locations
          </button>
          {locations.map((loc) => (
            <button
              key={loc}
              onClick={() => setLocationFilter(loc)}
              className={`px-3 py-1.5 rounded text-xs font-display tracking-wide transition-all duration-150 flex items-center gap-1 ${
                locationFilter === loc
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:border-gray-600'
              }`}
            >
              <MapPin className="w-3 h-3" />
              {loc}
            </button>
          ))}
          <button
            onClick={() => setLocationFilter('unlocated')}
            className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide transition-all duration-150 ${
              locationFilter === 'unlocated'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:border-gray-600'
            }`}
          >
            Unlocated
          </button>
        </div>
      )}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search shops or locations..."
        className="max-w-md"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500">{filtered.length} shops</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((shop) => (
          <ShopCard key={shop.id} shop={shop} onClick={setSelectedShop} />
        ))}
      </div>

      {hasMore && (
        <div className="text-center pt-2">
          <button onClick={() => setShowAll(true)} className="btn-secondary text-xs px-6">
            Show all ({filtered.length - INITIAL_COUNT} more)
          </button>
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500 font-mono text-sm">
          No shops found.
        </div>
      )}

      {/* Inventory slide-over */}
      {selectedShop && (
        <InventoryPanel shop={selectedShop} onClose={() => setSelectedShop(null)} />
      )}
    </div>
  )
}
