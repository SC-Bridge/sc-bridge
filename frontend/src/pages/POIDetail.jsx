import React, { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapPin, ArrowLeft } from 'lucide-react'
import { useLootLocationDetail } from '../hooks/useAPI'
import useGameVersion from '../hooks/useGameVersion'
import { friendlyLocation, friendlyFaction, getLocationGroup } from '../lib/lootLocations'
import { friendlyShopName } from '../lib/shopNames'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import SearchInput from '../components/SearchInput'
import {
  RARITY_STYLES, CATEGORY_LABELS, CATEGORY_BADGE_STYLES, CATEGORY_ORDER,
} from '../lib/lootDisplay'

// ── Location group badges ──────────────────────────────────────────────────
const GROUP_LABELS = {
  named:     'Named Location',
  cave:      'Cave',
  outpost:   'Outpost',
  dc:        'Distribution Centre',
  facility:  'Facility',
  contested: 'Contested Zone',
  station:   'Station',
  derelict:  'Derelict',
  generic:   'Generic',
}

// ── Detail page ────────────────────────────────────────────────────────────
export default function POIDetail() {
  const { type, slug } = useParams()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // Resolve the API type param from the URL structure
  // /poi/:slug → container, /poi/shop/:slug → shop, /poi/npc/:slug → npc
  const apiType = type === 'shop' ? 'shop' : type === 'npc' ? 'npc' : 'container'
  const decodedSlug = slug ? decodeURIComponent(slug) : ''

  const { activeCode } = useGameVersion()
  const { data, loading, error, refetch } = useLootLocationDetail(apiType, decodedSlug, activeCode)
  const items = data?.items || []

  // Resolve display names
  const locationName = apiType === 'shop'
    ? friendlyShopName(decodedSlug)
    : apiType === 'npc'
    ? friendlyFaction(decodedSlug)
    : friendlyLocation(decodedSlug)

  const groupBadge = apiType === 'shop'
    ? 'Shop'
    : apiType === 'npc'
    ? 'NPC Faction'
    : GROUP_LABELS[getLocationGroup(decodedSlug)] || getLocationGroup(decodedSlug)

  // Group items by category
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

    // Sort groups by category order, items by name within each group
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    for (const [, catItems] of sorted) {
      catItems.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted
  }, [items, search, activeCategory])

  // Category counts for filter chips
  const categoryCounts = useMemo(() => {
    const counts = { all: items.length }
    for (const item of items) {
      const cat = item.category || 'unknown'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [items])

  const filteredCount = categorizedItems.reduce((sum, [, catItems]) => sum + catItems.length, 0)

  if (loading) return <LoadingState message="Loading location..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  if (!slug || items.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Link to="/poi" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Locations
        </Link>
        <EmptyState
          message={`No items found for this location.`}
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
        subtitle={`${items.length} items available`}
        actions={
          <span className="text-[10px] font-display uppercase tracking-wide px-2 py-1 rounded bg-sc-accent/10 text-sc-accent border border-sc-accent/30">
            {groupBadge}
          </span>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search items at this location..."
        className="max-w-md"
      />

      {/* Category filter chips */}
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

      {/* Items grouped by category */}
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
                  <span className="text-xs text-gray-200 flex-1 min-w-0 truncate">{item.name}</span>
                  {item.sub_type && (
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">{item.sub_type}</span>
                  )}
                  {item.rarity && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      (RARITY_STYLES[item.rarity] || RARITY_STYLES.Common).badge
                    }`}>
                      {item.rarity}
                    </span>
                  )}
                  {item.perContainer != null && (
                    <span className="text-[10px] font-mono text-gray-600 shrink-0">
                      {(item.perContainer * 100).toFixed(1)}%
                    </span>
                  )}
                  {item.buyPrice != null && (
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">
                      {Math.round(item.buyPrice).toLocaleString()} aUEC
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
