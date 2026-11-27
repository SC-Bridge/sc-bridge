import React from 'react'
import { ShoppingCart } from 'lucide-react'
import { DmgShape, getDamageType, fmtDec1, SlotThumb } from './loadoutHelpers'

/** SVG └ bracket connector */
function Bracket() {
  return (
    <svg className="flex-shrink-0 w-3.5 h-[16px] -ml-3.5 mr-0" style={{ color: 'rgba(255,255,255,0.15)' }}
      viewBox="0 0 14 16" fill="none">
      <path d="M 2 0 L 2 9 Q 2 13 6 13 L 14 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/**
 * MissileBlock — renders a missile rack with its child missile.
 *
 * 3 rows:
 * Row 1: [S7] rack name
 * Row 2: └ [16×] missile name  S3
 * Row 3: manufacturer ■ alpha + cart
 */
export default function MissileBlock({ item, onClick, onAddToCart }) {
  const rackName = item.mount_name || item.component_name || 'Missile Rack'
  const missileCount = item.missile_count || 0
  const missileName = item.child_name !== rackName ? item.child_name : null
  const missileDmg = item.damage_per_shot
  const missileSize = item.component_size
  const dmgType = getDamageType(item)

  return (
    <div className="border-b border-white/[0.04] px-3 py-1.5">
      {/* Row 1: Rack */}
      <div className="flex items-center gap-2 cursor-pointer rounded transition-colors hover:bg-white/[0.03] -mx-1 px-1 leading-tight"
        onClick={onClick}>
        <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-px text-gray-400">
          S{item.size_max}
        </span>
        <span className="text-[13px] text-gray-500 flex-1 min-w-0">{rackName}</span>
      </div>
      {/* Row 2: └ count badge + missile name + stats inline */}
      {missileName && (
        <div className="flex items-center gap-1.5 cursor-pointer rounded transition-colors hover:bg-white/[0.03] -mx-1 px-1 leading-tight"
          style={{ marginLeft: '34px' }}
          onClick={onClick}>
          <Bracket />
          <span className="text-[12px] w-7 text-center flex-shrink-0 font-mono bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-px text-amber-400">
            {missileCount}×
          </span>
          <SlotThumb item={item} title={missileName} />
          <span className="text-[14px] font-medium text-gray-200">{missileName}</span>
          <span className="text-[12px] text-gray-600 flex-shrink-0">S{missileSize}</span>
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {dmgType && <DmgShape type={dmgType} />}
            {missileDmg ? <span className="font-mono text-[12px] text-gray-500">{fmtDec1(missileDmg)} <span className="text-gray-600">&#945;</span></span> : null}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onAddToCart?.() }}
            className="p-0.5 text-gray-700 hover:text-emerald-400 transition-colors cursor-pointer flex-shrink-0">
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
