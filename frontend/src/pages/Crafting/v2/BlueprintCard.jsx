import React from 'react'
import { Star, SlidersHorizontal, Repeat, Clock, Box, Check, Bookmark } from 'lucide-react'
import StatCell from './StatCell'
import { resolveStats } from './statConfig'
import { formatCraftTime } from '../craftingUtils'
import { getResourceColor } from './resourceGroups'

const TYPE_LABEL = { weapons: 'Weapon', armour: 'Armour', ammo: 'Ammo' }

// Solid type-color strip + glow — mockup .card-strip--weapon/armour/ammo
const STRIP_CLASS = {
  weapons: 'bg-[var(--type-weapon)] shadow-[0_0_8px_var(--type-weapon)]',
  armour:  'bg-[var(--type-armour)] shadow-[0_0_8px_var(--type-armour)]',
  ammo:    'bg-[var(--type-ammo)]   shadow-[0_0_8px_var(--type-ammo)]',
}

/**
 * Grid-mode blueprint card.
 *
 * Action row: OWNED · WISHLIST · SIM · COMPARE.
 * When isOwned, card gets a green-cyan border and an OWNED ribbon top-right.
 * isInCompare overrides border styling to keep the compare-tray cue dominant.
 */
export default function BlueprintCard({
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
  buildLabel = null,
  statsOverride = null,
}) {
  const stats = resolveStats(blueprint, statsOverride)
  const name = blueprint.base_stats?.item_name || blueprint.name
  const type = blueprint.type
  const subType = blueprint.sub_type
  const resourceNames = [...new Set((blueprint.slots || []).map(s => s.resource_name))]

  // Visual priority: compare tray > owned > default
  const stateStyle = isInCompare
    ? {
        borderColor: 'var(--selected-border)',
        background: 'var(--selected-bg)',
        boxShadow: 'var(--selected-inset), var(--selected-glow), var(--elevation-card)',
      }
    : isOwned
    ? {
        borderColor: 'rgba(52, 211, 153, 0.55)',
        boxShadow:
          'inset 0 0 0 1px rgba(52, 211, 153, 0.15), 0 0 18px rgba(52, 211, 153, 0.12), var(--elevation-card)',
      }
    : { boxShadow: 'var(--elevation-card)' }

  return (
    <article
      role="article"
      data-selected={isInCompare ? 'true' : 'false'}
      data-owned={isOwned ? 'true' : 'false'}
      data-wishlist={isWishlist ? 'true' : 'false'}
      className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--surface-card-border)] bg-[var(--surface-card)] backdrop-blur-[10px] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--hover-border)] hover:bg-[var(--surface-card-hover)]"
      style={stateStyle}
    >
      {/* Type strip */}
      <div className={`h-[3px] ${STRIP_CLASS[type] || ''}`} />

      {/* OWNED corner ribbon — only when owned and not in compare */}
      {isOwned && !isInCompare && (
        <div
          className="absolute top-[6px] right-[-26px] rotate-45 px-7 py-[2px] font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-black"
          style={{
            background: 'linear-gradient(180deg, rgb(110, 231, 183) 0%, rgb(52, 211, 153) 100%)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          Owned
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col gap-[12px] px-[14px] pt-[14px] pb-[12px]">
        <div className="flex items-center justify-between font-mono text-[9px] leading-[1.2] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-tertiary)]">
            {TYPE_LABEL[type] || type}
            {subType ? <span className="text-[var(--text-muted)]"> · {subType}</span> : null}
          </span>
          <span className="inline-flex items-center gap-[6px]">
            <Clock className="w-2.5 h-2.5 opacity-70" />
            {formatCraftTime(blueprint.craft_time_seconds)}
            <span className="text-[var(--text-subtle)]">·</span>
            {resourceNames.length} slots
          </span>
        </div>

        <h3 className="text-[0.9375rem] font-semibold leading-[1.3] tracking-[-0.01em]">
          <button
            type="button"
            onClick={() => onOpen(blueprint)}
            aria-label={`View ${name} details`}
            className="text-left text-[var(--text-primary)] hover:text-[var(--sc-accent)] transition-colors duration-150"
          >
            {name}
          </button>
        </h3>

        {/* Saved-build name — these stats are this build's quality config (#90) */}
        {buildLabel && (
          <div className="-mt-[6px] inline-flex items-center gap-[5px] self-start rounded-[var(--radius-sm,6px)] border border-[var(--sc-accent)]/30 bg-[var(--sc-accent)]/10 px-[7px] py-[2px] font-mono text-[10px] text-[var(--sc-accent)]">
            <Bookmark className="w-2.5 h-2.5" />
            {buildLabel}
          </div>
        )}

        <div className="grid grid-cols-3 gap-[6px] py-[10px] border-t border-b border-[var(--separator-subtle)]">
          {stats.map(stat => (
            <StatCell
              key={stat.key}
              label={stat.label}
              base={stat.base}
              max={stat.max}
              unit={stat.unit}
              isStatic={stat.isStatic}
            />
          ))}
        </div>

        <div className="flex items-center gap-[6px] flex-wrap">
          {resourceNames.slice(0, 5).map((rName) => (
            <span key={rName} className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              <span
                title={rName}
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getResourceColor(rName) }}
              />
              {rName}
            </span>
          ))}
          {resourceNames.length > 5 && (
            <span className="font-mono text-[9px] text-[var(--text-subtle)]">
              +{resourceNames.length - 5}
            </span>
          )}
        </div>
      </div>

      {/* Action row — 4 cells */}
      <div className="grid grid-cols-4 border-t border-[var(--separator-subtle)]">
        <ActionButton
          icon={
            isOwned ? (
              <Check className="w-3 h-3" />
            ) : (
              <Box className="w-3 h-3" />
            )
          }
          label="Owned"
          aria-label={isOwned ? 'Remove from owned' : 'Mark as owned'}
          active={isOwned}
          activeTint="success"
          onClick={() => onToggleOwned(blueprint)}
          divider
        />
        <ActionButton
          icon={<Star className="w-3 h-3" fill={isWishlist ? 'currentColor' : 'none'} />}
          label="Wish"
          aria-label={isWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          active={isWishlist}
          activeTint="warn"
          onClick={() => onToggleWishlist(blueprint)}
          divider
        />
        <ActionButton
          icon={
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
          }
          label={hasSavedSim ? 'Sim ✓' : 'Sim'}
          aria-label={hasSavedSim ? 'Quality Sim (saved config)' : 'Quality Sim'}
          active={hasSavedSim}
          activeTint="accent"
          onClick={() => onQualitySim(blueprint)}
          divider
        />
        <ActionButton
          icon={<Repeat className="w-3 h-3" />}
          label={isInCompare ? 'In Tray' : 'Compare'}
          aria-label="Compare"
          active={isInCompare}
          activeTint="accent"
          onClick={() => onCompare(blueprint)}
        />
      </div>
    </article>
  )
}

function ActionButton({ icon, label, onClick, active = false, activeTint, divider = false, ...rest }) {
  let colorCls
  if (active) {
    if (activeTint === 'warn') {
      colorCls = 'text-[var(--sc-warn)] bg-[rgba(245,166,35,0.06)]'
    } else if (activeTint === 'success') {
      colorCls = 'text-[rgb(52,211,153)] bg-[rgba(52,211,153,0.08)]'
    } else {
      colorCls = 'text-[var(--sc-accent)] bg-[var(--hover-bg)]'
    }
  } else {
    colorCls = 'text-[var(--text-muted)] hover:text-[var(--sc-accent)] hover:bg-[var(--hover-bg)]'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-[6px] py-[10px] px-2 font-mono text-[10px] leading-[1.2] uppercase tracking-[0.05em] transition-colors duration-150 cursor-pointer ${colorCls} ${divider ? 'border-r border-[var(--separator-subtle)]' : ''}`}
      {...rest}
    >
      {icon}
      {label}
    </button>
  )
}
