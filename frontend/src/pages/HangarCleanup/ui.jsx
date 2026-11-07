import React, { useEffect, useState } from 'react'

/** Flag / suggestion tones, kept separate from the accent colour. */
export const TONE = {
  bad: 'bg-sc-danger/15 text-red-300 border-sc-danger/40',
  warn: 'bg-sc-warn/15 text-amber-200 border-sc-warn/40',
  good: 'bg-sc-success/15 text-teal-200 border-sc-success/40',
  info: 'bg-sc-accent2/15 text-sc-accent2 border-sc-accent2/40',
  lti: 'bg-sc-lti/15 text-violet-200 border-sc-lti/40',
  melt: 'bg-sc-melt/15 text-sc-melt border-sc-melt/40',
  mute: 'bg-white/[0.04] text-gray-400 border-white/10',
}

export function Pill({ tone = 'mute', title, children }) {
  return (
    <span title={title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-display uppercase tracking-wide border whitespace-nowrap ${TONE[tone] ?? TONE.mute}`}>
      {children}
    </span>
  )
}

export function Chip({ active, onClick, count, title, children }) {
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-[0.05em] border transition-all cursor-pointer'
  const cls = active
    ? `${base} bg-sc-accent/15 text-sc-accent border-sc-accent/40`
    : `${base} bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/25`
  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={!!active} title={title}>
      {children}
      {count != null && <span className="font-mono text-[10px] opacity-70">{count}</span>}
    </button>
  )
}

/**
 * Dollar input that commits on blur/Enter, not on every keystroke, so typing
 * "1" on the way to "120" doesn't save $1.00. Empty commits null.
 */
export function MoneyInput({ id, cents, onCommit, placeholder = 'price', label }) {
  const toText = (c) => (c == null ? '' : (c / 100).toFixed(2))
  const [text, setText] = useState(toText(cents))
  useEffect(() => { setText(toText(cents)) }, [cents])
  const commit = () => {
    const v = parseFloat(text)
    const next = text.trim() === '' || !Number.isFinite(v) || v < 0 ? null : Math.round(v * 100)
    if (next !== cents) onCommit(next)
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm">
      <span className="text-gray-500">$</span>
      <input
        id={id}
        aria-label={label}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-24 bg-sc-darker border border-sc-border/60 rounded px-2 py-0.5 text-gray-100 focus:border-sc-accent outline-none"
      />
    </span>
  )
}

export const DECISIONS = [
  ['', 'Undecided'],
  ['keep', 'Keep'],
  ['melt', 'Melt'],
  ['melt-ig', 'Melt, buy in-game'],
  ['iae', 'Melt, rebuy at IAE (10-yr)'],
  ['ins', 'Upgrade insurance'],
  ['review', 'Review later'],
]

export const SUGGESTION_TONE = { melt: 'melt', 'melt-ig': 'melt', ins: 'bad', review: 'info', keep: 'good' }
