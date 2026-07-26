import React, { useState } from 'react'
import { Gem } from 'lucide-react'
import { resourceColor, resourceBgColor, resourceBorderColor, isItemSlot } from './craftingUtils'

export const SNAP_POINTS = [0, 250, 500, 750, 1000]
const SNAP_THRESHOLD = 15

export function snapValue(raw) {
  for (const sp of SNAP_POINTS) {
    if (Math.abs(raw - sp) <= SNAP_THRESHOLD) return sp
  }
  return raw
}

export default function QualitySlider({ slot, value, onChange }) {
  const [textValue, setTextValue] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const pct = (value / 1000) * 100

  // Keep text in sync when value changes externally (e.g. slider drag)
  React.useEffect(() => {
    if (!editing) setTextValue(String(value))
  }, [value, editing])

  const commitText = () => {
    setEditing(false)
    const parsed = parseInt(textValue)
    if (!isNaN(parsed)) {
      onChange(Math.max(0, Math.min(1000, parsed)))
    } else {
      setTextValue(String(value))
    }
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300">{slot.name}</span>
          {isItemSlot(slot) ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-violet-500/15 text-violet-300 border-violet-500/30"
              title="This slot requires a specific harvestable mineral, not a generic resource. Quality slider works the same way."
            >
              <Gem className="w-2.5 h-2.5" />
              {slot.resource_name}
              <span className="ml-1 px-1 py-px rounded text-[8px] font-bold tracking-wider bg-violet-500/20 text-violet-200">MINERAL</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
              style={{
                backgroundColor: resourceBgColor(slot.resource_name),
                borderColor: resourceBorderColor(slot.resource_name),
                color: resourceColor(slot.resource_name),
              }}
            >
              <Gem className="w-2.5 h-2.5" />
              {slot.resource_name}
            </span>
          )}
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={editing ? textValue : String(value)}
          onChange={e => { setTextValue(e.target.value); setEditing(true) }}
          onFocus={e => { setEditing(true); e.target.select() }}
          onBlur={commitText}
          onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
          className="w-12 text-right text-xs font-mono text-sc-accent bg-transparent border border-transparent hover:border-white/[0.08] focus:border-sc-accent/40 focus:bg-white/[0.03] rounded px-1 py-0.5 outline-none transition-all"
        />
      </div>
      <div className="relative">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)' }}>
          <div className="h-full bg-transparent" />
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={value}
          onChange={e => onChange(snapValue(parseInt(e.target.value)))}
          tabIndex={-1}
          className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
          style={{ top: '0' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-sc-accent shadow-[0_0_6px_rgba(34,211,238,0.5)] pointer-events-none transition-all duration-100"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
        {/* Snap point markers */}
        {SNAP_POINTS.slice(1, -1).map(sp => (
          <button
            key={sp}
            onClick={() => onChange(sp)}
            tabIndex={-1}
            className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
              value === sp ? 'bg-sc-accent scale-125' : 'bg-gray-600 hover:bg-gray-400'
            }`}
            style={{ left: `calc(${(sp / 1000) * 100}% - 3px)` }}
            title={`Q${sp}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-600">
        <button onClick={() => onChange(0)} tabIndex={-1} className="hover:text-gray-400 cursor-pointer transition-colors">0</button>
        <button onClick={() => onChange(1000)} tabIndex={-1} className="hover:text-gray-400 cursor-pointer transition-colors">1000</button>
      </div>
    </div>
  )
}
