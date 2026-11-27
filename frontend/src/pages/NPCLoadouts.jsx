import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  useNPCLoadouts, useNPCFactionLoadouts,
  useLootCollection, useLootWishlist,
  setLootCollectionQuantity, toggleLootWishlist,
} from '../hooks/useAPI'
import { useSession } from '../lib/auth-client'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { Users, ChevronDown, ChevronRight, ChevronLeft, ArrowLeft, Shield, Shirt, Crosshair, Wrench, Bug, Swords, FileText } from 'lucide-react'
import { toWords } from '../lib/lootLocations'
import { formatLoadoutName } from '../lib/npcNames'
import DetailPanel from './LootDB/DetailPanel'
import RenderThumb from '../components/RenderThumb'

// Tags for cosmetic/body items that aren't real gear — filter from display
const HIDDEN_TAGS = new Set([
  'Char_Body', 'Char_Body(Male)', 'Char_Body(Female)',
  'Char_Accessory_Head', 'Char_Accessory_Head(Vanduul)',
  'Char_Accessory_Eyes',
])
// Item name patterns for body parts and system items that aren't real gear
const HIDDEN_ITEM_PATTERNS = /^(Head_|Hair_|m_body_|f_body_|PU_Protos_|PU_Head_|collector_body|collector_head|collector_teeth|collector_eyes|MobiGlas|PersonalMobiGlas|Tattoo_Var_|Color_Var_|Skin_Var_|Female_Skin_Var_|Shared_Brows|FPS_Default|MineableRock_|harvestable_|invisible_|clothing_undersuit$)/i

function isHiddenItem(item) {
  if (item.tag && HIDDEN_TAGS.has(item.tag)) return true
  if (HIDDEN_ITEM_PATTERNS.test(item.item_name)) return true
  return false
}

// Fallback manufacturer names for prefixes that don't exactly match manufacturer codes
const PREFIX_OVERRIDES = {
  behr: 'Behring',
  srvl: 'Survival',
  sc: 'Star Citizen',
  female: '',
  pu: '',
}

/** Build a friendly display name for items without a loot_map match */
function buildFallbackName(item) {
  const prefix = item.item_name.split('_')[0].toLowerCase()
  const mfr = item.manufacturer_name || PREFIX_OVERRIDES[prefix]
  let name = item.item_name

  // Strip known non-gear prefixes (faction/role labels, not manufacturers)
  if (/^(outlaw|slaver|clothing|female|pu)_/i.test(name)) {
    name = name.replace(/^(outlaw|slaver|clothing|female|pu)_/i, '')
  }
  // Strip manufacturer prefix if we resolved a manufacturer name
  else if (mfr) {
    if (prefix.length <= 5) name = name.slice(prefix.length + 1)
  }

  // Clean up with toWords, then capitalize
  let display = toWords(name)
  // Collapse trailing numeric segments: "undersuit 01 01 01" → "Undersuit (Variant 01)"
  // SC item pattern: type_series_variant_color — only last segment is meaningful color variant
  display = display.replace(/(\s\d{2}){2,}$/, (m) => {
    const parts = m.trim().split(/\s+/)
    const last = parts[parts.length - 1]
    return last === '01' ? '' : ` (Variant ${last})`
  })
  display = display.replace(/\b[a-z]/g, c => c.toUpperCase())

  // Prefix with manufacturer if available
  if (mfr && mfr !== 'Unknown' && mfr !== '') {
    display = `${mfr} ${display}`
  }

  return display
}

const CATEGORY_ICONS = {
  armor: Shield,
  clothing: Shirt,
  weapon: Crosshair,
  utility: Wrench,
  creature: Bug,
  vanduul: Swords,
  banu: Users,
  body: Users,
  unknown: Users,
}

const CATEGORY_COLORS = {
  armor: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  clothing: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  weapon: 'text-red-400 bg-red-400/10 border-red-400/30',
  utility: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  creature: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  vanduul: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  banu: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  body: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
  unknown: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
}

const FACTION_COLORS = [
  'border-red-500/40 hover:border-red-500/60',
  'border-amber-500/40 hover:border-amber-500/60',
  'border-emerald-500/40 hover:border-emerald-500/60',
  'border-cyan-500/40 hover:border-cyan-500/60',
  'border-blue-500/40 hover:border-blue-500/60',
  'border-violet-500/40 hover:border-violet-500/60',
  'border-pink-500/40 hover:border-pink-500/60',
  'border-orange-500/40 hover:border-orange-500/60',
  'border-lime-500/40 hover:border-lime-500/60',
  'border-teal-500/40 hover:border-teal-500/60',
  'border-indigo-500/40 hover:border-indigo-500/60',
  'border-rose-500/40 hover:border-rose-500/60',
]

function FactionCard({ faction, index, onClick }) {
  const borderColor = FACTION_COLORS[index % FACTION_COLORS.length]
  return (
    <div className={`panel text-left transition-all duration-150 hover:bg-white/[0.04] border-l-2 ${borderColor}`}>
      <button
        onClick={onClick}
        className="p-4 w-full text-left"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display uppercase tracking-wider text-white">{faction.name}</h3>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex gap-3 mt-2 text-xs text-gray-500 font-mono">
          <span>{faction.loadout_count} loadouts</span>
          <span>{faction.item_count} items</span>
        </div>
      </button>
      <div className="px-4 pb-3 -mt-1">
        <Link
          to="/missions?view=factions"
          className="inline-flex items-center gap-1 text-[10px] font-mono text-sc-accent/70 hover:text-sc-accent transition-colors"
          title="View faction missions"
          onClick={(e) => e.stopPropagation()}
        >
          <FileText className="w-3 h-3" />
          View Missions
        </Link>
      </div>
    </div>
  )
}

export function LoadoutTree({ items, onSelectItem }) {
  if (!items || items.length === 0) return null

  // Filter out body/cosmetic items
  const gearItems = items.filter(i => !isHiddenItem(i))
  if (gearItems.length === 0) return null

  // Build tree from flat items using parent_port
  const portNames = new Set(gearItems.map(i => i.port_name))
  const topLevel = gearItems.filter(i => !i.parent_port || !portNames.has(i.parent_port))
  const childrenOf = (portName) => gearItems.filter(i => i.parent_port === portName)

  function renderItem(item, depth = 0) {
    const children = childrenOf(item.port_name)
    const isPlaceholder = item.resolved_name && /PLACEHOLDER|UNINITIALIZED/i.test(item.resolved_name)
    const displayName = (item.resolved_name && !isPlaceholder) ? item.resolved_name : buildFallbackName(item)
    const hasLootLink = item.loot_uuid && !isPlaceholder

    return (
      <div key={`${item.port_name}-${item.item_name}`} style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2 py-1">
          <span className="text-[10px] font-mono text-gray-600 uppercase shrink-0 w-24 truncate" title={item.port_name}>
            {toWords(item.port_name.replace('Armor_', '').replace('wep_stocked_', 'Weapon '))}
          </span>
          <RenderThumb
            render={item.render}
            kind={item.render_variants_kind}
            itemKey={item.render_item_key}
            variant={item.render_variant ?? ''}
            title={displayName}
            aspectRatio="row-sm"
          />
          {hasLootLink ? (
            <button
              onClick={() => onSelectItem(item.loot_uuid, item.loot_item_id)}
              className="text-xs font-mono text-sc-accent hover:underline truncate text-left"
              title={displayName}
            >
              {displayName}
            </button>
          ) : (
            <span className="text-xs font-mono text-gray-300 truncate" title={item.item_name}>
              {displayName}
            </span>
          )}
          {item.tag && (
            <span className="text-[9px] font-mono text-gray-600 shrink-0">
              {toWords(item.tag.replace('Char_Armor_', '').replace('Char_', '').replace('WeaponPersonal', 'Weapon'))}
            </span>
          )}
        </div>
        {children.map(child => renderItem(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="px-4 py-2">
      {topLevel.map(item => renderItem(item))}
    </div>
  )
}

function LoadoutCard({ loadout, defaultExpanded, onSelectItem }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const categoryColor = CATEGORY_COLORS[loadout.category] || CATEGORY_COLORS.unknown
  const CategoryIcon = CATEGORY_ICONS[loadout.category] || Users

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <CategoryIcon className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono text-gray-200 truncate block">
            {formatLoadoutName(loadout.loadout_name)}
          </span>
        </div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${categoryColor}`}>
          {loadout.category}
        </span>
        {loadout.sub_category && (
          <span className="text-[10px] font-mono text-gray-600 px-1.5 py-0.5 rounded bg-gray-800">
            {loadout.sub_category}
          </span>
        )}
        <span className="text-[10px] font-mono text-gray-600">
          {(loadout.items?.filter(i => !isHiddenItem(i))?.length || 0)} items
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        )}
      </button>
      {expanded && loadout.items && (
        <div className="border-t border-sc-border/30 bg-sc-bg/50">
          <LoadoutTree items={loadout.items} onSelectItem={onSelectItem} />
        </div>
      )}
    </div>
  )
}

function PaginationControls({ page, totalPages, totalLoadouts, onPageChange }) {
  if (totalPages <= 1) return null

  // Build page number range: show current ± 2, plus first/last
  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-mono text-gray-500">
        {totalLoadouts} loadouts · page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="text-xs text-gray-600 px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`text-xs font-mono px-2 py-1 rounded transition-colors ${
                p === page
                  ? 'bg-sc-accent/20 text-sc-accent'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function FactionDetail({ factionCode, autoExpandLoadout, onBack, onSelectItem }) {
  const [page, setPage] = useState(1)
  const { data, loading, error, refetch } = useNPCFactionLoadouts(factionCode, page)

  if (loading) return <LoadingState message="Loading loadouts..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return null

  const { faction, loadouts, totalLoadouts, totalPages } = data

  // Group loadouts by category (backend already filters hidden-only loadouts)
  const grouped = {}
  for (const loadout of loadouts) {
    const cat = loadout.category || 'unknown'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(loadout)
  }

  const handlePageChange = (newPage) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Factions
        </button>
        <h2 className="font-display font-bold text-xl tracking-wider text-white">{faction.name}</h2>
        <span className="text-xs font-mono text-gray-500">{totalLoadouts} loadouts</span>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalLoadouts={totalLoadouts}
        onPageChange={handlePageChange}
      />

      <div className="glow-line" />

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, catLoadouts]) => (
        <div key={category}>
          <h3 className="text-xs font-display uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
            {React.createElement(CATEGORY_ICONS[category] || Users, { className: 'w-3.5 h-3.5' })}
            {category} ({catLoadouts.length})
          </h3>
          <div className="space-y-1">
            {catLoadouts.map((loadout) => (
              <LoadoutCard
                key={loadout.id}
                loadout={loadout}
                defaultExpanded={autoExpandLoadout ? loadout.loadout_name.toLowerCase() === autoExpandLoadout.toLowerCase() : false}
                onSelectItem={onSelectItem}
              />
            ))}
          </div>
        </div>
      ))}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalLoadouts={totalLoadouts}
        onPageChange={handlePageChange}
      />
    </div>
  )
}

export default function NPCLoadouts() {
  const { data: factions, loading, error, refetch } = useNPCLoadouts()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: session } = useSession()
  const isAuthed = !!session?.user

  const selectedFaction = searchParams.get('faction') || null
  const autoExpandLoadout = searchParams.get('loadout') || null

  // Detail panel state
  const [detailUuid, setDetailUuid] = useState(null)
  const [detailItemId, setDetailItemId] = useState(null)

  // Collection & wishlist (same pattern as LootDB)
  const { data: collectionIds, refetch: refetchCollection } = useLootCollection(isAuthed)
  const { data: wishlistItems, refetch: refetchWishlist } = useLootWishlist(isAuthed)

  const collected = useMemo(() => {
    if (!collectionIds) return new Map()
    return new Map(collectionIds.map(e => [e.loot_uuid, e.quantity]))
  }, [collectionIds])

  const wishlistIds = useMemo(
    () => new Set(wishlistItems?.map(i => i.uuid) ?? []),
    [wishlistItems]
  )

  const handleSelectItem = useCallback((uuid, itemId) => {
    setDetailUuid(uuid)
    setDetailItemId(itemId ?? null)
  }, [])

  const handleSetCollectionQty = useCallback(async (uuid, qty) => {
    try {
      await setLootCollectionQuantity(uuid, qty)
      refetchCollection()
    } catch (err) { console.warn('[NPCLoadouts] Collection update failed:', err.message) }
  }, [refetchCollection])

  const handleToggleWishlist = useCallback(async (uuid, isWishlisted) => {
    try {
      await toggleLootWishlist(uuid, isWishlisted)
      refetchWishlist()
    } catch (err) { console.warn('[NPCLoadouts] Wishlist toggle failed:', err.message) }
  }, [refetchWishlist])

  const setSelectedFaction = useCallback((code) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (code) {
        next.set('faction', code)
      } else {
        next.delete('faction')
      }
      next.delete('loadout')
      return next
    }, { replace: true })
  }, [setSearchParams])

  if (loading) return <LoadingState message="Loading NPC factions..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <>
      {selectedFaction ? (
        <FactionDetail
          factionCode={selectedFaction}
          autoExpandLoadout={autoExpandLoadout}
          onBack={() => setSelectedFaction(null)}
          onSelectItem={handleSelectItem}
        />
      ) : (
        <div className="space-y-4 animate-fade-in-up">
          <PageHeader
            title="NPC Loadouts"
            subtitle="What gear do NPCs wear and carry, organized by faction"
          />

          <div className="glow-line" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(factions || []).map((faction, i) => (
              <FactionCard
                key={faction.id}
                faction={faction}
                index={i}
                onClick={() => setSelectedFaction(faction.code)}
              />
            ))}
          </div>
        </div>
      )}

      {detailUuid && (
        <DetailPanel
          uuid={detailUuid}
          manufacturerName={null}
          collectionQty={collected.get(detailUuid) ?? 0}
          onSetCollectionQty={handleSetCollectionQty}
          wishlisted={wishlistIds.has(detailUuid)}
          onToggleWishlist={handleToggleWishlist}
          isAuthed={isAuthed}
          onClose={() => { setDetailUuid(null); setDetailItemId(null) }}
        />
      )}
    </>
  )
}
