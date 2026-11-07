import React, { useState } from 'react'
import { stepsAsText } from '../../lib/hangarCleanup'

/** The plan as a numbered checklist: melts, credit check, purchases, follow-ups. */
export default function ProcessView({ plan, done, onToggleDone, undecidedMelts }) {
  const [copied, setCopied] = useState('')
  const [text, setText] = useState(null)
  const doneSet = new Set(done)

  const copy = async () => {
    const t = stepsAsText(plan, done)
    setText(t)
    try {
      await navigator.clipboard.writeText(t)
      setCopied('Copied')
    } catch {
      setCopied('Select the text below to copy')
    }
    setTimeout(() => setCopied(''), 2000)
  }

  if (!plan.actionable) {
    return (
      <div className="panel p-6 text-gray-400">
        Nothing planned yet. Choose decisions in the ledger (Melt, Melt and rebuy at IAE, Upgrade insurance…) or tick ships under Buy at IAE, then come back here.
      </div>
    )
  }

  let n = 0
  return (
    <section className="space-y-5" aria-label="Step-by-step plan">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-400 mr-auto">
          {undecidedMelts > 0 && `${undecidedMelts} suggested melt${undecidedMelts > 1 ? 's have' : ' has'} no decision yet, so ${undecidedMelts > 1 ? 'they are' : 'it is'} not in this plan.`}
        </p>
        <button type="button" className="btn-secondary !py-1.5" onClick={copy}>{copied || 'Copy as text'}</button>
      </div>
      {plan.phases.map((ph) => (
        <div key={ph.key} className="space-y-2">
          <h3 className="font-display text-sm uppercase tracking-wider text-sc-accent2">{ph.title}</h3>
          {ph.intro && <p className="text-sm text-gray-400 max-w-3xl">{ph.intro}</p>}
          <ol className="space-y-2">
            {ph.steps.map((s) => {
              n++
              const isDone = doneSet.has(s.key)
              return (
                <li key={s.key} className={`panel p-3 grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 items-start ${isDone ? 'opacity-55' : ''}`}>
                  <input type="checkbox" className="mt-1" checked={isDone} onChange={() => onToggleDone(s.key)} aria-label={`Mark step ${n} done`} />
                  <span className="font-mono font-semibold text-sc-melt w-6 text-right">{n}</span>
                  <div className="min-w-0 space-y-0.5">
                    <div className={`font-display font-semibold text-white ${isDone ? 'line-through' : ''}`}>{s.title}</div>
                    {s.meta.map((m) => <div key={m} className="text-xs text-gray-400">{m}</div>)}
                    {s.money.length > 0 && <div className="text-xs font-mono text-gray-300 tabular-nums">{s.money.join(' · ')}</div>}
                    {s.warn.map((w) => <div key={w} className="text-xs text-amber-300">{w}</div>)}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
      {text != null && <textarea readOnly value={text} aria-label="Plan as text" className="w-full h-48 bg-sc-darker border border-sc-border/60 rounded p-2 font-mono text-xs text-gray-200" />}
    </section>
  )
}
