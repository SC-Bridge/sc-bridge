import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { MapPin, ArrowLeft, Store, ChevronDown, ChevronRight } from 'lucide-react'
import { useLootLocationDetail, usePOI } from '../hooks/useAPI'
import { friendlyFaction } from '../lib/lootLocations'
import { friendlyShopName } from '../lib/shopNames'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import SearchInput from '../components/SearchInput'
import RenderThumb from '../components/RenderThumb'
import {
  RARITY_STYLES, CATEGORY_LABELS, CATEGORY_BADGE_STYLES, CATEGORY_ORDER,
} from '../lib/lootDisplay'

import POIHeader from './POI/POIHeader'
import POIShops from './POI/POIShops'
import POILootPool from './POI/POILootPool'
import POIMissions from './POI/POIMissions'
import POINPCs from './POI/POINPCs'
import POISiblings from './POI/POISiblings'

// ── Legacy shop-type badges (used by the /poi/shop/:slug + /poi/npc/:slug
// sub-views — not the new POI page). Keep for back-compat while those
// drill-down routes still exist.
const SHOP_TYPE_STYLES = {
  admin:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  weapon:   'bg-red-500/10 text-red-400 border-red-500/30',
  armor:    'bg-amber-500/10 text-amber-400 border-amber-500/30',
  clothing: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  food:     'bg-green-500/10 text-green-400 border-green-500/30',
  ship:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  default:  'bg-gray-500/10 text-gray-400 border-gray-500/30',
}

// ── Shop / NPC drill-down (legacy) ────────────────────────────────────────
// The new POI page handles the default /poi/:slug route via <POIPage/> below.
// Shop + NPC sub-pages use the old flat-item list (nothing has changed for
// those — they drill from a POI into a specific shop/faction and want the
// flat view).
export function LegacyShopOrNPCDetail({ apiType, decodedSlug }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const activeCategory = searchParams.get('cat') || 'all'

  const setSearch = (value) => setSearchParams(prev => {
    if (value) prev.set('q', value); else prev.delete('q')
    return prev
  }, { replace: true })

  const setActiveCategory = (cat) => setSearchParams(prev => {
    if (cat && cat !== 'all') prev.set('cat', cat); else prev.delete('cat')
    return prev
  }, { replace: true })

  const { data, loading, error, refetch } = useLootLocationDetail(apiType, decodedSlug)
  const items = data?.items || []

  const locationName = apiType === 'shop'
    ? friendlyShopName(decodedSlug)
    : friendlyFaction(decodedSlug)

  const groupBadge = apiType === 'shop' ? 'Shop' : 'NPC Faction'

  const categorizedItems = useMemo(() => {
    let filtered = items
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.type && i.type.toLowerCase().includes(q)) ||
        (i.sub_type && i.sub_type.toLowerCase().includes(q))
      )
    }
    if (activeCategory !== 'all') {
      filtered = filtered.filter(i => i.category === activeCategory)
    }
    const groups = new Map()
    for (const item of filtered) {
      const cat = item.category || 'unknown'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat).push(item)
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    for (const [, catItems] of sorted) catItems.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [items, search, activeCategory])

  const categoryCounts = useMemo(() => {
    const counts = { all: items.length }
    for (const item of items) {
      const cat = item.category || 'unknown'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [items])

  const filteredCount = categorizedItems.reduce((sum, [, catItems]) => sum + catItems.length, 0)

  if (loading) return <LoadingState message="Loading..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (items.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Link to="/poi" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Locations
        </Link>
        <EmptyState
          message="No items found for this location."
          icon={MapPin}
          large
          actionLink={{ to: '/poi', label: 'Browse all locations' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <Link to="/poi" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Locations
      </Link>

      <PageHeader
        title={locationName}
        subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'} available`}
        actions={
          <span className="text-[10px] font-display uppercase tracking-wide px-2 py-1 rounded bg-sc-accent/10 text-sc-accent border border-sc-accent/30">
            {groupBadge}
          </span>
        }
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search items..." className="max-w-md" />

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide transition-colors ${
            activeCategory === 'all'
              ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/30'
              : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:bg-white/5'
          }`}
        >
          All ({categoryCounts.all || 0})
        </button>
        {CATEGORY_ORDER.filter(cat => categoryCounts[cat]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide transition-colors ${
              activeCategory === cat
                ? 'bg-sc-accent/10 text-sc-accent border border-sc-accent/30'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:bg-white/5'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
          </button>
        ))}
      </div>

      <span className="text-xs font-mono text-gray-500">{filteredCount} results</span>

      <div className="space-y-6">
        {categorizedItems.map(([category, catItems]) => (
          <div key={category}>
            <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3 pl-1">
              {CATEGORY_LABELS[category] || category} ({catItems.length})
            </h3>
            <div className="space-y-0">
              {catItems.map(item => (
                <Link
                  key={item.uuid}
                  to={`/loot/${item.uuid}`}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-sc-border hover:bg-white/3 transition-colors"
                >
                  <span className={`text-[10px] font-display uppercase px-1.5 py-0.5 rounded shrink-0 w-20 text-center ${
                    CATEGORY_BADGE_STYLES[item.category] || CATEGORY_BADGE_STYLES.unknown
                  }`}>
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                  <RenderThumb
                    render={item.render}
                    kind={item.render_variants_kind}
                    itemKey={item.render_item_key}
                    variant={item.render_variant ?? ''}
                    title={item.name}
                  />
                  <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
                  {item.sub_type && (
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">{item.sub_type}</span>
                  )}
                  {item.rarity && item.rarity !== 'N/A' && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      (RARITY_STYLES[item.rarity] || RARITY_STYLES.Common).badge
                    }`}>
                      {item.rarity}
                    </span>
                  )}
                  {item.buyPrice != null && (
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">
                      Buy: {Math.round(item.buyPrice).toLocaleString()} aUEC
                    </span>
                  )}
                  {item.sellPrice != null && (
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">
                      Sell: {Math.round(item.sellPrice).toLocaleString()} aUEC
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── New POI page (location-centric) ───────────────────────────────────────
function POIPage({ slug }) {
  const navigate = useNavigate()
  const { data, loading, error, refetch } = usePOI(slug)

  // Swap URL in place if user arrived via an alias slug (e.g. /poi/FloatingIslands
  // → canonical /poi/stanton2-orison). Uses replaceState rather than a 301 so
  // the originally-shared URL stays valid.
  useEffect(() => {
    if (!data?.location) return
    const { canonical_slug } = data.location
    if (canonical_slug && canonical_slug !== slug) {
      navigate(`/poi/${encodeURIComponent(canonical_slug)}`, { replace: true })
    }
  }, [data, slug, navigate])

  if (loading) return <LoadingState message="Loading location..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data || !data.location) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Link to="/poi" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Locations
        </Link>
        <EmptyState
          message="This location couldn't be found."
          icon={MapPin}
          large
          actionLink={{ to: '/poi', label: 'Browse all locations' }}
        />
      </div>
    )
  }

  const { location, shops, loot_pools, missions, npc_factions, siblings } = data
  const parentSlug = (location.hierarchy || [])[0]?.slug || null

  const totallyEmpty =
    shops.count === 0 && loot_pools.count === 0 && missions.count === 0
  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link to="/poi" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Locations
      </Link>
      <POIHeader location={location} />
      {totallyEmpty ? (
        <div className="p-8 border border-sc-border/50 rounded text-center space-y-2">
          <p className="text-sm text-gray-400">No known activity at this location yet.</p>
          <p className="text-xs text-gray-600">
            Shops, loot spawns, and missions for this POI haven't been catalogued.{' '}
            <a
              href="https://github.com/SC-Bridge/sc-bridge/issues/new?title=Missing%20POI%20data"
              target="_blank"
              rel="noreferrer"
              className="text-sc-accent hover:underline"
            >
              Report missing data
            </a>
          </p>
        </div>
      ) : (
        <>
          <POIShops envelope={shops} />
          <POILootPool envelope={loot_pools} />
          <POIMissions envelope={missions} />
          <POINPCs envelope={npc_factions} />
        </>
      )}
      <POISiblings envelope={siblings} parentSlug={parentSlug} />
    </div>
  )
}

// ── Route dispatcher ──────────────────────────────────────────────────────
export default function POIDetail() {
  const { type, slug } = useParams()
  const decodedSlug = slug ? decodeURIComponent(slug) : ''
  // /poi/:slug          → new POI page (location-centric)
  // /poi/shop/:slug     → legacy shop-item list
  // /poi/npc/:slug      → legacy NPC-faction-item list
  if (type === 'shop' || type === 'npc') {
    return <LegacyShopOrNPCDetail apiType={type} decodedSlug={decodedSlug} />
  }
  return <POIPage slug={decodedSlug} />
}
