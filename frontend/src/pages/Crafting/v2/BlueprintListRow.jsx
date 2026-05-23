import React from 'react'
import { Star, SlidersHorizontal, Repeat, Clock, Box, Check } from 'lucide-react'
import { resolveStats } from './statConfig'
import { formatCraftTime } from '../craftingUtils'

// Two toggles in the leading column: Owned, Wishlist (each 22px wide).
const GRID_TEMPLATE =
  '4px 50px minmax(140px, 1fr) 68px 68px 68px 68px 68px 68px 96px 108px'

const STRIP_BG = {
  weapons: 'bg-[var(--type-weapon)]',
  armour:  'bg-[var(--type-armour)]',
  ammo:    'bg-[var(--type-ammo)]',
}

const TYPE_TEXT = {
  weapons: 'text-[var(--type-weapon)]',
  armour:  'text-[var(--type-armour)]',
  ammo:    'text-[var(--type-ammo)]',
}

const TYPE_LABEL = { weapons: 'Weapon', armour: 'Armour', ammo: 'Ammo' }

/**
 * A single data row in BlueprintListView. Column template matches the
 * header so alignment is pixel-perfect. Every cell has min-width: 0 so
 * the name column can compress below its intrinsic size (load-bearing
 * for responsive sizing — see spec §11.1).
 */
export default function BlueprintListRow({
  blueprint,
  isInCompare = false,
  isOwned = false,
  isWishlist = false,
  hasSavedSim = false,
  onToggleOwned = () => {},
  onToggleWishlist = () => {},
  onQualitySim = () => {},
  onCompare = () => {},
  onOpen = () => {},
}) {
  const stats = resolveStats(blueprint)
  const name = blueprint.base_stats?.item_name || blueprint.name
  // Owned wins over wishlist as a row tint, compare wins over both.
  const selectedStyle = isInCompare
    ? { backgroundColor: 'var(--selected-bg)', boxShadow: 'inset 3px 0 0 var(--sc-accent)' }
    : isOwned
    ? { boxShadow: 'inset 3px 0 0 rgb(52, 211, 153), inset 0 0 0 1px rgba(52, 211, 153, 0.08)' }
    : undefined

  return (
    <div
      role="row"
      onClick={() => onOpen(blueprint)}
      data-selected={isInCompare ? 'true' : 'false'}
      data-owned={isOwned ? 'true' : 'false'}
      data-wishlist={isWishlist ? 'true' : 'false'}
      className="grid items-stretch border-b border-[var(--separator-subtle)] transition-colors duration-150 hover:bg-[var(--surface-card-hover)] cursor-pointer"
      style={{ gridTemplateColumns: GRID_TEMPLATE, minWidth: '780px', ...selectedStyle }}
    >
      {/* Strip */}
      <div className={`h-full ${STRIP_BG[blueprint.type] || ''}`} />

      {/* Owned + Wishlist toggles */}
      <div className="flex items-center justify-center gap-1 px-1 py-3 min-w-0">
        <button
          type="button"
          aria-label={isOwned ? 'Remove from owned' : 'Mark as owned'}
          onClick={(e) => { e.stopPropagation(); onToggleOwned(blueprint) }}
          className={isOwned ? 'text-[rgb(52,211,153)]' : 'text-[var(--text-subtle)] hover:text-[var(--text-tertiary)]'}
        >
          {isOwned
            ? <Check className="w-[13px] h-[13px]" />
            : <Box className="w-[13px] h-[13px]" />}
        </button>
        <button
          type="button"
          aria-label={isWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={(e) => { e.stopPropagation(); onToggleWishlist(blueprint) }}
          className={isWishlist ? 'text-[var(--sc-warn)]' : 'text-[var(--text-subtle)] hover:text-[var(--text-tertiary)]'}
        >
          <Star className="w-[13px] h-[13px]" fill={isWishlist ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Name + meta column */}
      <div className="flex flex-col justify-center items-start gap-[2px] px-2 py-3 min-w-0 overflow-hidden">
        <div className="text-[13px] font-semibold text-white truncate max-w-full">{name}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)] truncate max-w-full">
          <span className={TYPE_TEXT[blueprint.type] || ''}>
            {TYPE_LABEL[blueprint.type]} · {blueprint.sub_type}
          </span>
          {' · '}{blueprint.slots?.length || 0} slots
        </div>
      </div>

      {/* Six stat cells — each value is a single number, right-aligned */}
      <StatNumCell value={stats[0]?.base} tone="base" />
      <StatNumCell value={stats[0]?.max}  tone="max"  separator />
      <StatNumCell value={stats[1]?.base} tone="base" />
      <StatNumCell value={stats[1]?.max}  tone="max"  separator />
      <StatNumCell value={stats[2]?.base} tone="base" />
      <StatNumCell value={stats[2]?.max}  tone="max"  separator />

      {/* Craft time */}
      <div className="flex items-center justify-end pl-6 pr-[10px] py-3 min-w-0 font-mono text-[12px] text-[var(--text-tertiary)] gap-[6px]">
        <Clock className="w-[11px] h-[11px] opacity-60" />
        {formatCraftTime(blueprint.craft_time_seconds)}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1 pr-3 py-3 min-w-0">
        <IconAction
          label={hasSavedSim ? 'Quality Sim (saved config)' : 'Quality Sim'}
          active={hasSavedSim}
          onClick={() => onQualitySim(blueprint)}
        >
          <span className="relative inline-flex">
            <SlidersHorizontal className="w-3 h-3" />
            {hasSavedSim && (
              <span
                className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[var(--sc-accent)]"
                style={{ boxShadow: '0 0 4px var(--sc-accent)' }}
                aria-hidden
              />
            )}
          </span>
        </IconAction>
        <IconAction label="Compare" active={isInCompare} onClick={() => onCompare(blueprint)}>
          <Repeat className="w-3 h-3" />
        </IconAction>
      </div>
    </div>
  )
}

function StatNumCell({ value, tone, separator = false }) {
  const toneCls = tone === 'max'
    ? 'text-white font-bold'
    : 'text-[var(--text-muted)] font-semibold'
  const sep = separator ? 'border-r border-transparent' : '' // row separators deliberately blank; header handles visual grouping
  return (
    <div
      className={`flex items-center justify-end px-[10px] py-3 min-w-0 font-mono text-[12px] ${toneCls} ${sep}`}
      style={tone === 'max' ? { textShadow: '0 0 6px rgba(34, 211, 238, 0.2)' } : undefined}
    >
      {value == null ? '—' : value}
    </div>
  )
}

function IconAction({ children, onClick, label, active = false }) {
  const activeCls = active
    ? 'text-[var(--sc-accent)] border-[rgba(34,211,238,0.4)] bg-[var(--hover-bg)]'
    : 'text-[var(--text-muted)] border-white/[0.08] hover:bg-[var(--hover-bg)] hover:border-[var(--hover-border)] hover:text-[var(--sc-accent)]'
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`w-[26px] h-[26px] rounded-[var(--radius-md)] border flex items-center justify-center transition-colors duration-150 ${activeCls}`}
    >
      {children}
    </button>
  )
}
