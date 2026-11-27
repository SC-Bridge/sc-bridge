import React from 'react'
import { ShoppingCart, RotateCcw } from 'lucide-react'
import { DmgShape, getDamageType, fmtDec1, SlotThumb } from './loadoutHelpers'

/** SVG └ bracket connector for parent→child */
function Bracket() {
  return (
    <svg className="flex-shrink-0 w-3.5 h-[16px] -ml-3.5 mr-0" style={{ color: 'rgba(255,255,255,0.15)' }}
      viewBox="0 0 14 16" fill="none">
      <path d="M 2 0 L 2 9 Q 2 13 6 13 L 14 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** Gimbal icon (circle + crosshair) */
function GimbalIcon({ className = '' }) {
  return (
    <svg className={`w-3.5 h-3.5 flex-shrink-0 text-gray-600 ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** Fixed mount icon (square + crosshair) */
function FixedIcon({ className = '' }) {
  return (
    <svg className={`w-3.5 h-3.5 flex-shrink-0 text-gray-600 ${className}`} viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor" strokeWidth="1.2" rx="1" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <line x1="8" y1="0.5" x2="8" y2="4" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="12" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1" />
      <line x1="0.5" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="8" x2="15.5" y2="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** Weapon group badges — 2×2 grid */
function WgGrid({ weaponGroups = [], onToggleGroup }) {
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {[1, 2, 3, 4].map(n => {
        const active = weaponGroups.includes(n)
        return (
          <button
            key={n}
            onClick={(e) => { e.stopPropagation(); onToggleGroup?.(n) }}
            className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-semibold cursor-pointer transition-all duration-150
              ${active
                ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40'
                : 'bg-white/[0.03] text-gray-600 border border-white/[0.08] hover:bg-white/[0.06] hover:text-gray-400'
              }`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

/** Grade badge with color */
function GradeBadge({ grade }) {
  if (!grade) return null
  const colors = {
    A: 'bg-sc-accent/10 text-sc-accent border-sc-accent/20',
    B: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    C: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    D: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  return (
    <span className={`font-mono text-[11px] px-1 py-px rounded flex-shrink-0 border ${colors[grade] || colors.C}`}>
      {grade}
    </span>
  )
}

/** Stats row — grade, manufacturer, damage shape, DPS, alpha, cart */
function StatsRow({ item, isCustomized, marginLeft = '76px', onAddToCart }) {
  const dps = item.dps
  const alpha = item.damage_per_shot
  const dmgType = getDamageType(item)
  const statColor = isCustomized ? 'text-sc-accent' : 'text-gray-500'

  return (
    <div className="flex items-center gap-2 pb-0.5" style={{ marginLeft }}>
      <GradeBadge grade={item.grade} />
      {item.manufacturer_name && <span className="text-[12px] text-gray-600 flex-shrink-0">{item.manufacturer_name}</span>}
      {isCustomized && <span className="text-[11px] text-sc-accent bg-sc-accent/10 px-1 rounded flex-shrink-0">custom</span>}
      {dmgType && <DmgShape type={dmgType} />}
      {dps ? <span className={`font-mono text-[13px] ${statColor}`} title="DPS (Damage Per Second)">{fmtDec1(dps)} <span className="text-gray-600">dps</span></span> : null}
      {alpha ? <span className={`font-mono text-[13px] ${statColor}`} title="Alpha Damage (Damage Per Shot)">{fmtDec1(alpha)} <span className="text-gray-600">&#945;</span></span> : null}
      <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
        {isCustomized && onReset && (
          <button onClick={(e) => { e.stopPropagation(); onReset() }}
            className="p-1 text-gray-600 hover:text-amber-400 transition-colors cursor-pointer" title="Reset to default">
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onAddToCart?.() }}
          className="p-1 text-gray-700 hover:text-emerald-400 transition-colors cursor-pointer">
          <ShoppingCart className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * WeaponBlock — renders a single weapon hardpoint.
 *
 * Gimballed: 3 rows — mount + WG 2×2 | └ weapon name (full) | stats line
 * Fixed: 2 rows — weapon name + fixed badge + WG 2×2 | stats line
 */
export default function WeaponBlock({ item, isCustomized, weaponGroups = [], onClickMount, onClickWeapon, onToggleGroup, onAddToCart, onReset }) {
  const hasMount = item.mount_name && item.child_name && item.mount_name !== item.child_name
  const isGimbal = hasMount && (item.sub_type === 'GunTurret' || item.mount_name?.includes('Gimbal') || item.mount_name?.includes('VariPuck'))
  const weaponCount = item.weapon_count || 0
  const weaponPrefix = weaponCount > 1 ? `${weaponCount}× ` : ''
  const weaponName = item.child_name || item.component_name
  const sz = item.component_size || item.size_max
  const dps = item.dps
  const alpha = item.damage_per_shot
  const dmgType = getDamageType(item)

  if (hasMount) {
    // GIMBALLED: 2 rows — mount row, then indented child with inline stats
    return (
      <div className={`border-b border-white/[0.04] px-3 py-1.5 ${isCustomized ? 'bg-sc-accent/[0.02]' : ''}`}>
        {/* Row 1: Mount + WG 2×2 */}
        <div
          onClick={onClickMount}
          className="flex items-center gap-2 cursor-pointer rounded transition-colors hover:bg-white/[0.03] -mx-1 px-1 leading-tight"
        >
          <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
            S{item.size_max}
          </span>
          {isGimbal ? <GimbalIcon /> : <FixedIcon />}
          <span className="text-[13px] text-gray-500 flex-1 min-w-0">{item.mount_name}</span>
          <WgGrid weaponGroups={weaponGroups} onToggleGroup={onToggleGroup} />
        </div>

        {/* Row 2: └ weapon name + grade + mfr + stats + cart — all on one line */}
        <div
          onClick={onClickWeapon}
          className="flex items-center gap-1.5 cursor-pointer rounded transition-colors hover:bg-white/[0.03] -mx-1 px-1 leading-tight"
          style={{ marginLeft: '34px' }}
        >
          <Bracket />
          <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
            S{sz}
          </span>
          <SlotThumb item={item} title={weaponName} />
          <span className={`text-[14px] font-medium ${isCustomized ? 'text-sc-accent' : 'text-gray-200'}`}
            style={isCustomized ? { textShadow: '0 0 8px rgba(34,211,238,0.3)' } : undefined}>
            {weaponPrefix}{weaponName || 'Empty'}
          </span>
          <GradeBadge grade={item.grade} />
          {isCustomized && <span className="text-[11px] text-sc-accent bg-sc-accent/10 px-1 rounded flex-shrink-0">custom</span>}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {dmgType && <DmgShape type={dmgType} />}
            {dps ? <span className={`font-mono text-[12px] ${isCustomized ? 'text-sc-accent' : 'text-gray-500'}`} title="DPS (Damage Per Second)">{fmtDec1(dps)} <span className="text-gray-600">dps</span></span> : null}
            {alpha ? <span className={`font-mono text-[12px] ${isCustomized ? 'text-sc-accent' : 'text-gray-500'}`} title="Alpha Damage (Damage Per Shot)">{fmtDec1(alpha)} <span className="text-gray-600">&#945;</span></span> : null}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isCustomized && onReset && (
              <button onClick={(e) => { e.stopPropagation(); onReset() }}
                className="p-0.5 text-gray-600 hover:text-amber-400 transition-colors cursor-pointer" title="Reset to default">
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onAddToCart?.() }}
              className="p-0.5 text-gray-700 hover:text-emerald-400 transition-colors cursor-pointer">
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // FIXED: 2 rows — name row + stats row
  return (
    <div className={`border-b border-white/[0.04] px-3 py-1.5 ${isCustomized ? 'bg-sc-accent/[0.02]' : ''}`}>
      {/* Row 1: weapon name + fixed badge + WG 2×2 */}
      <div
        onClick={onClickWeapon}
        className="flex items-center gap-2 cursor-pointer rounded transition-colors hover:bg-white/[0.03] -mx-1 px-1 leading-tight"
      >
        <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
          S{sz}
        </span>
        <FixedIcon />
        <SlotThumb item={item} title={weaponName} />
        <span className={`text-[14px] font-medium flex-1 min-w-0 ${isCustomized ? 'text-sc-accent' : 'text-gray-200'}`}
          style={isCustomized ? { textShadow: '0 0 8px rgba(34,211,238,0.3)' } : undefined}>
          {weaponName || 'Empty'}
        </span>
        <span className="text-[11px] text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/15 flex-shrink-0">fixed</span>
        {isCustomized && <span className="text-[11px] text-sc-accent bg-sc-accent/10 px-1 rounded flex-shrink-0">custom</span>}
        <WgGrid weaponGroups={weaponGroups} onToggleGroup={onToggleGroup} />
      </div>

      {/* Row 2: stats — grade + mfr + dmg + DPS + alpha + cart */}
      <StatsRow item={item} isCustomized={isCustomized} marginLeft="42px" onAddToCart={onAddToCart} />
    </div>
  )
}
