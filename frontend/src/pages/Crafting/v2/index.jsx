import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FlaskConical, Search, X } from 'lucide-react'
import { useCrafting, useUserBlueprints, setBlueprintState } from '../../../hooks/useAPI'
import LoadingState from '../../../components/LoadingState'
import ErrorState from '../../../components/ErrorState'
import ViewToggle from '../../../components/ViewToggle'
import TypeSwitcher from './TypeSwitcher'
import BlueprintCard from './BlueprintCard'
import BlueprintListView from './BlueprintListView'
import CompareTray from './CompareTray'
import useCompareTray from './useCompareTray'
import { deriveCategory, SUB_FILTERS } from './blueprintCategory'

const VIEW_STORAGE_KEY = 'blueprintView'
const TYPE_STORAGE_KEY = 'blueprintType'

const CATEGORY_KEYS = new Set([
  'fps_weapon', 'fps_armour', 'fps_ammo', 'ship_weapon', 'ship_component',
])

const LEGACY_TYPE_TO_CATEGORY = {
  weapons: 'fps_weapon',
  armour:  'fps_armour',
  ammo:    'fps_ammo',
}

function readStoredView() {
  const v = typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'list' ? 'list' : 'grid'
}

function readStoredType() {
  const t = typeof localStorage !== 'undefined' && localStorage.getItem(TYPE_STORAGE_KEY)
  if (CATEGORY_KEYS.has(t)) return t
  // Migrate users who had `weapons | armour | ammo` saved before the rename.
  if (LEGACY_TYPE_TO_CATEGORY[t]) return LEGACY_TYPE_TO_CATEGORY[t]
  return 'fps_weapon'
}

/**
 * Crafting v2 — Owned + Wishlist tracking added.
 *
 * State sources:
 *   - useCrafting() → all blueprints + slots + base stats
 *   - useUserBlueprints() → which blueprints the current user marks owned/wished
 *
 * Owned/wishlist edits go through setBlueprintState (PUT /api/blueprints/state).
 * We optimistically update local sets so the card responds instantly, then
 * refetch to settle on server truth (covers the case where the server
 * deletes a row when both flags drop to false).
 */
export default function CraftingV2() {
  const { data, loading, error, refetch } = useCrafting()
  const userBp = useUserBlueprints()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-state helper — mirrors the convention used across the app (Missions,
  // Loot). Puts search/tab/state in the query string so the view is
  // bookmarkable + shareable. `replace` avoids spamming history while typing.
  const setParam = useCallback((key, val, replace = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (val) next.set(key, val)
      else next.delete(key)
      return next
    }, { replace })
  }, [setSearchParams])

  const [view, setView] = useState(readStoredView)

  // activeType: ?type= wins, else last-used (localStorage), else default.
  // Persisted to localStorage on change so a no-param visit restores your tab.
  const activeType = useMemo(() => {
    const t = searchParams.get('type')
    if (CATEGORY_KEYS.has(t)) return t
    if (LEGACY_TYPE_TO_CATEGORY[t]) return LEGACY_TYPE_TO_CATEGORY[t]
    return readStoredType()
  }, [searchParams])
  const setActiveType = useCallback((t) => setParam('type', t), [setParam])

  // Search → ?q= (replace:true so each keystroke doesn't push a history entry).
  const search = searchParams.get('q') || ''
  const setSearch = useCallback((v) => setParam('q', v, true), [setParam])

  // State filter → ?state= ('all' is the default and stays out of the URL).
  const stateFilter = useMemo(() => {
    const s = searchParams.get('state')
    return ['owned', 'wishlist', 'sim'].includes(s) ? s : 'all'
  }, [searchParams])
  const setStateFilter = useCallback((s) => setParam('state', s === 'all' ? '' : s), [setParam])
  // Per-tab sub-filter selections — keyed by axis.key from SUB_FILTERS.
  // Each axis has its own selected value ('all' or a stringified bucket).
  // Reset when switching tabs.
  const [subFilters, setSubFilters] = useState({})
  const setSubFilter = (axisKey, value) =>
    setSubFilters(prev => ({ ...prev, [axisKey]: value }))
  const compare = useCompareTray()

  // Reset sub-filter selections when the user changes tabs — different
  // tabs have different axes, the values wouldn't transfer meaningfully.
  useEffect(() => { setSubFilters({}) }, [activeType])

  useEffect(() => { localStorage.setItem(VIEW_STORAGE_KEY, view) }, [view])
  useEffect(() => { localStorage.setItem(TYPE_STORAGE_KEY, activeType) }, [activeType])

  // Build sets of owned/wishlist UUIDs for O(1) card lookup. Local
  // optimistic overlays apply on top of server truth.
  const [ownedOverlay, setOwnedOverlay] = useState({})    // uuid → bool
  const [wishlistOverlay, setWishlistOverlay] = useState({})

  const ownedSet = useMemo(() => {
    const s = new Set()
    for (const item of userBp.data?.items || []) {
      if (item.is_owned && item.blueprint_uuid) s.add(item.blueprint_uuid)
    }
    for (const [uuid, val] of Object.entries(ownedOverlay)) {
      if (val) s.add(uuid); else s.delete(uuid)
    }
    return s
  }, [userBp.data, ownedOverlay])

  const wishlistSet = useMemo(() => {
    const s = new Set()
    for (const item of userBp.data?.items || []) {
      if (item.is_wishlist && item.blueprint_uuid) s.add(item.blueprint_uuid)
    }
    for (const [uuid, val] of Object.entries(wishlistOverlay)) {
      if (val) s.add(uuid); else s.delete(uuid)
    }
    return s
  }, [userBp.data, wishlistOverlay])

  // Blueprints with a saved quality-sim config — surfaced as a small
  // indicator on the card so users know "I have a custom config saved here."
  const simSet = useMemo(() => {
    const s = new Set()
    for (const item of userBp.data?.items || []) {
      if (item.has_quality_config && item.blueprint_uuid) s.add(item.blueprint_uuid)
    }
    return s
  }, [userBp.data])

  const counts = useMemo(() => ({
    all: data?.blueprints?.length ?? 0,
    owned: ownedSet.size,
    wishlist: wishlistSet.size,
    sim: simSet.size,
  }), [data, ownedSet, wishlistSet, simSet])

  const normSearch = search.trim().toLowerCase()

  // BPs limited to the active category — feeds both sub-filter chip
  // counts and the final filtered list.
  const categoryBlueprints = useMemo(() => {
    if (!data?.blueprints) return []
    return data.blueprints.filter(bp => deriveCategory(bp) === activeType)
  }, [data, activeType])

  // Per-tab sub-filter axes (1+ per category).
  const axes = SUB_FILTERS[activeType] ?? []

  // Compute bucket counts once per axis. Each axis row in the UI reads
  // from its own entry in this map.
  const bucketsByAxis = useMemo(() => {
    const out = {}
    for (const axis of axes) {
      const counts = new Map()
      for (const bp of categoryBlueprints) {
        const v = axis.extract(bp)
        if (v == null || v === '') continue
        const key = String(v)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const seen = new Set()
      const rows = []
      if (axis.order) {
        for (const v of axis.order) {
          const key = String(v)
          if (counts.has(key)) {
            rows.push({ key, value: v, count: counts.get(key) })
            seen.add(key)
          }
        }
      }
      const remainder = [...counts.entries()]
        .filter(([k]) => !seen.has(k))
        .sort(([, a], [, b]) => b - a)
        .map(([k, c]) => ({ key: k, value: k, count: c }))
      out[axis.key] = [...rows, ...remainder]
    }
    return out
  }, [axes, categoryBlueprints])

  const blueprints = useMemo(() => {
    return categoryBlueprints.filter(bp => {
      if (stateFilter === 'owned' && !(bp.uuid && ownedSet.has(bp.uuid))) return false
      if (stateFilter === 'wishlist' && !(bp.uuid && wishlistSet.has(bp.uuid))) return false
      if (stateFilter === 'sim' && !(bp.uuid && simSet.has(bp.uuid))) return false

      // Apply each axis filter if a specific bucket is selected.
      for (const axis of axes) {
        const sel = subFilters[axis.key]
        if (sel && sel !== 'all') {
          const v = axis.extract(bp)
          if (String(v) !== sel) return false
        }
      }

      if (normSearch) {
        const haystack = [
          bp.base_stats?.item_name,
          bp.name,
          bp.tag,
          bp.sub_type,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(normSearch)) return false
      }
      return true
    })
  }, [categoryBlueprints, stateFilter, ownedSet, wishlistSet, simSet, subFilters, axes, normSearch])

  const handleQualitySim = (bp) => navigate(`/crafting/${bp.id}?tab=quality`)
  // Open the blueprint detail (default 'materials' tab) — shows "How to Obtain"
  // / acquisition sources. Restores the click-through that used to work.
  const handleOpenDetail = (bp) => navigate(`/crafting/${bp.id}`)

  const toggleState = useCallback(async (bp, field) => {
    const uuid = bp.uuid
    if (!uuid) return
    const currentlyOn =
      field === 'owned' ? ownedSet.has(uuid) : wishlistSet.has(uuid)
    const next = !currentlyOn

    // Optimistic update
    if (field === 'owned') {
      setOwnedOverlay(prev => ({ ...prev, [uuid]: next }))
    } else {
      setWishlistOverlay(prev => ({ ...prev, [uuid]: next }))
    }

    try {
      await setBlueprintState({ blueprintUuid: uuid, [field]: next })
      // Refetch to clear overlay and pick up server truth.
      await userBp.refetch?.()
      if (field === 'owned') {
        setOwnedOverlay(prev => { const n = { ...prev }; delete n[uuid]; return n })
      } else {
        setWishlistOverlay(prev => { const n = { ...prev }; delete n[uuid]; return n })
      }
    } catch (e) {
      // Revert on failure
      if (field === 'owned') {
        setOwnedOverlay(prev => ({ ...prev, [uuid]: currentlyOn }))
      } else {
        setWishlistOverlay(prev => ({ ...prev, [uuid]: currentlyOn }))
      }
      console.error('Failed to update blueprint state', e)
    }
  }, [ownedSet, wishlistSet, userBp])

  const handleToggleOwned = useCallback((bp) => toggleState(bp, 'owned'), [toggleState])
  const handleToggleWishlist = useCallback((bp) => toggleState(bp, 'wishlist'), [toggleState])

  if (loading) return <LoadingState fullScreen message="Loading crafting blueprints..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      {/* Hero */}
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[rgba(34,211,238,0.6)] mb-2">
          Star Citizen · Crafting Blueprints · v2
        </p>
        <h1
          className="text-[30px] font-bold text-white tracking-wide"
          style={{ textShadow: '0 0 30px rgba(34, 211, 238, 0.2)' }}
        >
          Blueprints
        </h1>
      </div>

      {/* Controls — type / search / view */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <TypeSwitcher activeType={activeType} onChange={setActiveType} />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-subtle)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blueprints..."
            aria-label="Search blueprints"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md pl-8 pr-7 py-1.5 text-[12px] text-gray-200 placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--sc-accent)]/40 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <ViewToggle value={view} onChange={setView} />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap font-mono text-[10px] uppercase tracking-[0.05em]">
        <FilterChip active={stateFilter === 'all'} onClick={() => setStateFilter('all')}>
          All <span className="opacity-60">· {counts.all}</span>
        </FilterChip>
        <FilterChip
          active={stateFilter === 'owned'}
          tint="success"
          onClick={() => setStateFilter('owned')}
          disabled={counts.owned === 0}
        >
          Owned <span className="opacity-60">· {counts.owned}</span>
        </FilterChip>
        <FilterChip
          active={stateFilter === 'wishlist'}
          tint="warn"
          onClick={() => setStateFilter('wishlist')}
          disabled={counts.wishlist === 0}
        >
          Wishlist <span className="opacity-60">· {counts.wishlist}</span>
        </FilterChip>
        <FilterChip
          active={stateFilter === 'sim'}
          tint="accent"
          onClick={() => setStateFilter('sim')}
          disabled={counts.sim === 0}
        >
          Saved Sim <span className="opacity-60">· {counts.sim}</span>
        </FilterChip>
      </div>

      {/* Per-tab sub-filter chip rows — one row per axis */}
      {axes.map(axis => {
        const buckets = bucketsByAxis[axis.key] ?? []
        if (buckets.length === 0) return null
        const sel = subFilters[axis.key] ?? 'all'
        return (
          <div
            key={axis.key}
            className="flex items-center gap-1.5 mb-3 flex-wrap font-mono text-[10px] uppercase tracking-[0.05em]"
          >
            <span className="text-[var(--text-subtle)] mr-1">{axis.label}:</span>
            <FilterChip active={sel === 'all'} onClick={() => setSubFilter(axis.key, 'all')}>
              All <span className="opacity-60">· {categoryBlueprints.length}</span>
            </FilterChip>
            {buckets.map(({ key, value, count }) => {
              const label = axis.format ? axis.format(value) : String(value)
              return (
                <FilterChip
                  key={key}
                  active={sel === key}
                  onClick={() => setSubFilter(axis.key, key)}
                >
                  {label} <span className="opacity-60">· {count}</span>
                </FilterChip>
              )
            })}
          </div>
        )
      })}

      {/* Grid or list */}
      {blueprints.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 text-[var(--text-subtle)]" />
          <p className="text-[var(--text-muted)]">No blueprints for this type.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {blueprints.map(bp => (
            <BlueprintCard
              key={bp.id}
              blueprint={bp}
              isInCompare={compare.isInTray(bp)}
              isOwned={!!bp.uuid && ownedSet.has(bp.uuid)}
              isWishlist={!!bp.uuid && wishlistSet.has(bp.uuid)}
              hasSavedSim={!!bp.uuid && simSet.has(bp.uuid)}
              onToggleOwned={handleToggleOwned}
              onToggleWishlist={handleToggleWishlist}
              onQualitySim={handleQualitySim}
              onCompare={compare.toggle}
              onOpen={handleOpenDetail}
            />
          ))}
        </div>
      ) : (
        <BlueprintListView
          blueprints={blueprints}
          activeType={activeType}
          compareItems={compare.items}
          ownedSet={ownedSet}
          wishlistSet={wishlistSet}
          simSet={simSet}
          onToggleOwned={handleToggleOwned}
          onToggleWishlist={handleToggleWishlist}
          onQualitySim={handleQualitySim}
          onCompare={compare.toggle}
          onOpen={handleOpenDetail}
        />
      )}

      <CompareTray
        items={compare.items}
        onRemove={compare.remove}
        onClear={compare.clear}
      />
    </div>
  )
}

function FilterChip({ active, onClick, disabled = false, tint = 'accent', children }) {
  const tintMap = {
    accent: { active: 'bg-[var(--hover-bg)] border-[var(--sc-accent)]/40 text-[var(--sc-accent)]' },
    success: { active: 'bg-[rgba(52,211,153,0.08)] border-[rgba(52,211,153,0.45)] text-[rgb(52,211,153)]' },
    warn: { active: 'bg-[rgba(245,166,35,0.06)] border-[var(--sc-warn)]/40 text-[var(--sc-warn)]' },
  }
  const activeCls = tintMap[tint]?.active || tintMap.accent.active
  const idleCls =
    'bg-white/[0.02] border-white/[0.08] text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-white'
  const disabledCls = 'opacity-40 cursor-not-allowed hover:bg-white/[0.02] hover:text-[var(--text-muted)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 rounded-full border transition-colors duration-150 ${active ? activeCls : idleCls} ${disabled ? disabledCls : ''}`}
    >
      {children}
    </button>
  )
}
