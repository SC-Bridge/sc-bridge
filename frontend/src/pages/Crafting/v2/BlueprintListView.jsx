import React, { useMemo } from 'react'
import BlueprintListHeader from './BlueprintListHeader'
import BlueprintListRow from './BlueprintListRow'
import useSortState from './useSortState'
import { STAT_CONFIG, readStat } from './statConfig'

// Map from the category keys used by the Crafting browser to the
// stat-config keys (which still match the raw bp.type domain). Ship
// weapons share weapon stats. Ship components have no shared stat
// schema yet — fall back to weapons config so the list still renders;
// columns will simply be blank.
const STAT_KEY_FOR_CATEGORY = {
  fps_weapon: 'weapons',
  fps_armour: 'armour',
  fps_ammo:   'ammo',
  ship_weapon: 'weapons',
  ship_component: 'weapons',
}

/**
 * Selector builder — given a column key like 'dps_base' or 'rpm_max' or
 * 'craft' or 'name', return a function that extracts that value from a row.
 */
function buildSelector(colKey, statConfig) {
  if (colKey === 'name') return (bp) => bp.base_stats?.item_name || bp.name || ''
  if (colKey === 'craft') return (bp) => bp.craft_time_seconds ?? null

  // <statKey>_base or <statKey>_max
  const [statKey, tone] = colKey.split('_')
  const stat = statConfig?.stats.find(s => s.key === statKey)
  if (!stat) return () => null
  const path = tone === 'max' ? stat.maxPath : stat.basePath
  return (bp) => readStat(bp, path) ?? (tone === 'max' ? readStat(bp, stat.basePath) : null)
}

/**
 * List view container. Sticky two-row header + sortable data rows.
 *
 * Scroll context: the .list-view wrapper owns overflow (+ max-height set
 * by the caller). The header sticks to the top of this container, not
 * the viewport — see spec §11.2.
 */
export default function BlueprintListView({
  blueprints,
  activeType,
  compareItems = [],
  ownedSet = new Set(),
  wishlistSet = new Set(),
  simSet = new Set(),
  onToggleOwned = () => {},
  onToggleWishlist = () => {},
  onQualitySim = () => {},
  onCompare = () => {},
  onOpen = () => {},
  maxHeight = 'calc(100vh - 280px)',
}) {
  const sort = useSortState('craft', 'desc')
  // activeType is now a category key (fps_weapon, ship_weapon, …) — translate
  // to a stat-config key. Legacy callers that still pass raw type strings
  // (weapons/armour/ammo) keep working via the direct fallback.
  const statKey = STAT_KEY_FOR_CATEGORY[activeType] ?? activeType
  const statConfig = STAT_CONFIG[statKey]

  // Deps use the primitives sort.column and sort.direction rather than the
  // whole sort object — the object identity is new each render (plain object
  // literal from useSortState), which would defeat memoization entirely.
  const sortedBlueprints = useMemo(() => {
    const selector = buildSelector(sort.column, statConfig)
    return sort.applySort(blueprints, selector)
  }, [blueprints, sort.column, sort.direction, sort.applySort, statConfig])

  const inCompare = (bp) => compareItems.some(i => i.id === bp.id)

  return (
    <div
      className="overflow-auto rounded-[var(--radius-2xl)] border border-[var(--surface-list-border)] bg-[var(--surface-list)]"
      style={{ maxHeight }}
    >
      <BlueprintListHeader
        type={statKey}
        sortColumn={sort.column}
        sortDir={sort.direction}
        onSort={sort.toggle}
      />
      {sortedBlueprints.map(bp => (
        <BlueprintListRow
          key={bp.id}
          blueprint={bp}
          isInCompare={inCompare(bp)}
          isOwned={!!bp.uuid && ownedSet.has(bp.uuid)}
          isWishlist={!!bp.uuid && wishlistSet.has(bp.uuid)}
          hasSavedSim={!!bp.uuid && simSet.has(bp.uuid)}
          onToggleOwned={onToggleOwned}
          onToggleWishlist={onToggleWishlist}
          onQualitySim={onQualitySim}
          onCompare={onCompare}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
