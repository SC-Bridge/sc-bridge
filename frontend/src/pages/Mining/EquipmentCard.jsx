import React from 'react'
import { useNavigate } from 'react-router-dom'
import RenderThumb from '../../components/RenderThumb'
import { EQUIPMENT_TYPE_COLORS, MOD_LABELS, MOD_POSITIVE_IS_GOOD, formatModPct, getStrongestMod } from './miningUtils'

export default function EquipmentCard({ item, equipType, index = 0 }) {
  const navigate = useNavigate()
  const color = EQUIPMENT_TYPE_COLORS[equipType] || { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' }

  const strongest = getStrongestMod(item)
  const strongestLabel = strongest ? MOD_LABELS[strongest.key] : null
  const strongestGood = strongest ? (strongest.value > 0 ? MOD_POSITIVE_IS_GOOD[strongest.key] : !MOD_POSITIVE_IS_GOOD[strongest.key]) : false

  const open = () => navigate(`/mining/${equipType}/${item.id}`)

  // A div, not a button: the render thumb inside is its own button.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      className="cursor-pointer group relative w-full text-left bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-4 shadow-lg shadow-black/20 transition-all duration-200 hover:border-sc-accent/30 hover:shadow-sc-accent/10 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] animate-stagger-fade-up space-y-3"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-sc-accent/0 group-hover:border-sc-accent/30 transition-colors duration-200 rounded-tl-xl" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-sc-accent/0 group-hover:border-sc-accent/30 transition-colors duration-200 rounded-br-xl" />

      {/* Badges */}
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${color.bg} ${color.text} border ${color.border}`}>
          {equipType}
        </span>
        {item.size != null && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
            S{item.size}
          </span>
        )}
        {item.manufacturer && (
          <span className="text-[10px] text-gray-600 truncate">{item.manufacturer}</span>
        )}
      </div>

      {item.render && (
        <RenderThumb
          render={item.render}
          kind={item.render_variants_kind}
          itemKey={item.render_item_key}
          variant={item.render_variant}
          title={item.name}
          className="rounded-lg"
        />
      )}

      {/* Name */}
      <h3 className="text-sm font-semibold text-gray-200 tracking-wide group-hover:text-white transition-colors">
        {item.name}
      </h3>

      {/* Key stat */}
      <div className="flex items-center justify-between text-xs">
        {equipType === 'laser' && (
          <>
            <span className="text-gray-500 font-mono">
              {item.beam_dps?.toFixed(1)} DPS · {item.module_slots} slots
            </span>
          </>
        )}
        {equipType === 'module' && (
          <span className="text-gray-500 font-mono">
            {item.type} · {item.charges != null ? `${item.charges} charges` : 'passive'}
          </span>
        )}
        {equipType === 'gadget' && (
          <span className="text-gray-500 font-mono">consumable</span>
        )}

        {/* Strongest modifier */}
        {strongest && (
          <span className={`font-mono ${strongestGood ? 'text-emerald-400' : 'text-red-400'}`}>
            {strongestLabel}: {formatModPct(strongest.value)}
          </span>
        )}
      </div>
    </div>
  )
}
