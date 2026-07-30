import React, { useState, useEffect } from 'react'

export default function MassSlider({ value, min, max, step = 1, defaultValue, label, unit, onChange }) {
  const [textValue, setTextValue] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  // Keep text in sync when value changes externally (e.g. slider drag)
  useEffect(() => {
    if (!editing) setTextValue(String(value))
  }, [value, editing])

  const commitText = () => {
    setEditing(false)
    const parsed = parseFloat(textValue)
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)))
    } else {
      setTextValue(String(value))
    }
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        <div className="flex items-center gap-1.5">
          {defaultValue != null && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              tabIndex={-1}
              title={`Reset to ${defaultValue}`}
              className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer transition-colors"
            >
              reset
            </button>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={editing ? textValue : String(value)}
            onChange={e => { setTextValue(e.target.value); setEditing(true) }}
            onFocus={e => { setEditing(true); e.target.select() }}
            onBlur={commitText}
            onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
            className="w-16 text-right text-xs font-mono text-sc-accent bg-transparent border border-transparent hover:border-white/[0.08] focus:border-sc-accent/40 focus:bg-white/[0.03] rounded px-1 py-0.5 outline-none transition-all"
          />
          {unit && <span className="text-[10px] text-gray-500 font-mono">{unit}</span>}
        </div>
      </div>
      <div className="relative">
        <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
          <div className="h-full bg-transparent" />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          tabIndex={-1}
          className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
          style={{ top: '0' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-sc-accent shadow-[0_0_6px_rgba(34,211,238,0.5)] pointer-events-none transition-all duration-100"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
    </div>
  )
}
