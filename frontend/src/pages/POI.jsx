import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Package, ShoppingCart, Swords } from 'lucide-react'
import { useLootLocations } from '../hooks/useAPI'
import { friendlyLocation, friendlyFaction, getLocationGroup } from '../lib/lootLocations'
import { friendlyShopName } from '../lib/shopNames'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'

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

// ── Rarity summary ─────────────────────────────────────────────────────────
const RARITY_DOT = {
  Common:    'text-gray-400',
  Uncommon:  'text-green-400',
  Rare:      'text-sc-accent',
  Epic:      'text-purple-400',
  Legendary: 'text-amber-400',
}

function RaritySummary({ rarities }) {
  const ordered = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']
  const present = ordered.filter(r => rarities[r])
  if (present.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {present.slice(0, 3).map(r => (
        <span key={r} className={`text-[9px] font-mono ${RARITY_DOT[r] || 'text-gray-500'}`}>
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

// ── Main page ──────────────────────────────────────────────────────────────
export default function POI() {
  const { data, loading, error } = useLootLocations()
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('containers')
  const [activeGroup, setActiveGroup] = useState('all')

  // Containers: grouped by location group
  const containerEntries = useMemo(() => {
    if (!data?.containers) return []
    return data.containers.map((loc) => ({
      rawKey: loc.key,
      friendlyName: friendlyLocation(loc.key),
      group: getLocationGroup(loc.key),
      itemCount: loc.itemCount,
      rarities: loc.rarities || {},
    }))
  }, [data])

  // Shops
  const shopEntries = useMemo(() => {
    if (!data?.shops) return []
    return data.shops.map((loc) => ({
      rawKey: loc.key,
      friendlyName: friendlyShopName(loc.key),
      itemCount: loc.itemCount,
      rarities: loc.rarities || {},
    }))
  }, [data])

  // NPCs
  const npcEntries = useMemo(() => {
    if (!data?.npcs) return []
    return data.npcs.map((loc) => ({
      rawKey: loc.key,
      friendlyName: friendlyFaction(loc.key),
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

  const totalLocations =
    (activeSection === 'containers' ? containerEntries.length : 0) +
    (activeSection === 'shops' ? shopEntries.length : 0) +
    (activeSection === 'npcs' ? npcEntries.length : 0)

  if (loading) return <LoadingState message="Loading locations..." />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="LOCATIONS"
        subtitle={`${containerEntries.length} loot locations, ${shopEntries.length} shops, ${npcEntries.length} factions`}
        actions={<MapPin className="w-5 h-5 text-gray-500" />}
      />

      {/* Section tabs */}
      <div className="flex gap-0 border-b border-sc-border">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveSection(key); setActiveGroup('all') }}
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
        onChange={(e) => setSearch(e.target.value)}
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
        {activeSection === 'containers' ? filteredContainers.length
         : activeSection === 'shops' ? filteredShops.length
         : filteredNpcs.length} results
      </span>

      {/* ── Containers section ── */}
      {activeSection === 'containers' && (
        <>
          {activeGroup === 'all' && !search.trim() && groupedContainers ? (
            <div className="space-y-6">
              {groupedContainers.map(([groupKey, entries]) => (
                <div key={groupKey}>
                  <h3 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-3 pl-1">
                    {LOCATION_GROUP_CONFIG[groupKey]?.label ?? groupKey}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredContainers.map(entry => (
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
          )}
        </>
      )}

      {/* ── Shops section ── */}
      {activeSection === 'shops' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredShops.map(entry => (
            <LocationCard
              key={entry.rawKey}
              rawKey={entry.rawKey}
              friendlyName={entry.friendlyName}
              itemCount={entry.itemCount}
              rarities={entry.rarities}
              linkPrefix="/poi/shop/"
            />
          ))}
        </div>
      )}

      {/* ── NPCs section ── */}
      {activeSection === 'npcs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNpcs.map(entry => (
            <LocationCard
              key={entry.rawKey}
              rawKey={entry.rawKey}
              friendlyName={entry.friendlyName}
              itemCount={entry.itemCount}
              rarities={entry.rarities}
              linkPrefix="/poi/npc/"
            />
          ))}
        </div>
      )}
    </div>
  )
}
