// frontend/src/pages/FpsLoadout/statCells.jsx
//
// Shared bench stat-grid cell primitives (#200 slice 2) — extracted from
// StatsGrid so ArmourStatsGrid can reuse the same fixed-layout cell contract:
// every cell always renders; only values change.
import React from 'react'

export const EM_DASH = '—'
export const fmt = (v, d = 0) => (v == null ? null : Number(v).toFixed(d))

export function pctDelta(base, build) {
  if (base == null || build == null || base === 0) return null
  return ((build - base) / base) * 100
}

export function DeltaSub({ deltaPct, suffix }) {
  if (deltaPct == null || Math.abs(deltaPct) < 0.05) {
    return <span className="text-gray-600">{suffix}</span>
  }
  const cls = deltaPct > 0 ? 'text-sc-success' : 'text-sc-danger'
  const sign = deltaPct > 0 ? '+' : ''
  return (
    <>
      <span className={cls}>{sign}{deltaPct.toFixed(0)}%</span>
      {suffix ? <span className="text-gray-600"> · {suffix}</span> : null}
    </>
  )
}

export function Cell({ label, value, sub, dyn = false, na = false }) {
  return (
    <div
      data-testid="stat-cell"
      className={[
        'rounded border px-2.5 py-1.5 min-h-[48px]',
        'border-white/[0.08] bg-black/20',
        dyn ? 'border-l-2 border-l-sc-accent' : '',
        na ? 'opacity-40' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="text-[8.5px] uppercase tracking-wide text-sc-accent2">{label}</div>
      <div className={`text-sm font-semibold tabular-nums leading-tight ${na ? 'text-gray-500' : 'text-gray-100'}`}>
        {value == null ? EM_DASH : value}
      </div>
      <div className="text-[9px] text-gray-500">{sub}</div>
    </div>
  )
}
