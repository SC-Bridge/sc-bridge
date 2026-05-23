/**
 * PART K K11: render structured mission_rep_changes rows as colored size
 * badges per event.
 *
 * Backend (K13) returns `rep_changes[mission_id] = [{scope_slug, event,
 * size_code, direction, rep_amount}, ...]`. This component renders one row
 * per `event` group (typically "fail" and "abandon") as a small label +
 * inline chips like `security −L` `affinity −S`.
 *
 * When `rep_changes` is empty (e.g. before the K8 extractor re-load),
 * we fall back to parsing the raw `rep_fail_summary` / `rep_abandon_summary`
 * strings on the mission row — so the UI shows something useful immediately,
 * not a blank cell.
 */
import React from 'react'
import { formatRepSize, humanizeScopeSlug } from '../lib/missionConstants'

const SIGN = { positive: '+', negative: '−' }
const DIR_CLS = {
  positive: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  negative: 'bg-red-500/10 text-red-300 border-red-500/30',
}

/**
 * Parse a legacy summary string like "security: -XXS, affinity: -S" into rows
 * matching the K13 shape. Used only as a fallback when rep_changes is empty.
 */
export function parseLegacyRepSummary(summary, event) {
  if (!summary) return []
  const out = []
  const re = /\s*([a-zA-Z_]+)\s*:\s*([+\-])\s*([a-zA-Z]+)\s*/g
  let m
  while ((m = re.exec(summary)) !== null) {
    out.push({
      scope_slug: m[1].toLowerCase(),
      event,
      size_code: m[3].toUpperCase(),
      direction: m[2] === '-' ? 'negative' : 'positive',
      rep_amount: null,
    })
  }
  return out
}

function Badge({ change }) {
  const sign = SIGN[change.direction] || '?'
  const cls = DIR_CLS[change.direction] || 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30'
  // Prefer the resolved numeric rep amount (e.g. -50); fall back to the fixed
  // CIG size ladder if rep_amount wasn't resolved at extract time; last resort
  // the raw size code. Players want the number, not "XXXXS".
  let value
  if (typeof change.rep_amount === 'number') {
    // Use the − (U+2212) minus glyph to match formatRepSize output.
    value = `${change.rep_amount < 0 ? '−' : '+'}${Math.abs(change.rep_amount).toLocaleString()}`
  } else {
    value = formatRepSize(change.size_code, change.direction) || `${sign}${change.size_code}`
  }
  const human = humanizeScopeSlug(change.scope_slug) || change.scope_slug
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono whitespace-nowrap ${cls}`}
      title={`${human}: ${value} rep (${sign}${change.size_code})`}
    >
      {human} {value}
    </span>
  )
}

/**
 * Renders all rep_changes rows grouped by event, with a small label per event.
 *
 * Props:
 *  - changes: array of rep_changes rows for one mission (optional; if empty, fall back)
 *  - repFailSummary / repAbandonSummary: legacy fallback strings on the mission row
 */
export function RepCostBadges({ changes, repFailSummary, repAbandonSummary }) {
  // Build effective changes from changes[] OR legacy summary strings.
  let effective = changes && changes.length ? changes : []
  if (!effective.length) {
    effective = [
      ...parseLegacyRepSummary(repFailSummary, 'fail'),
      ...parseLegacyRepSummary(repAbandonSummary, 'abandon'),
    ]
  }
  if (!effective.length) return null

  // Group by event in a stable order.
  const EVENT_ORDER = ['success', 'fail', 'abandon']
  const byEvent = new Map()
  for (const c of effective) {
    if (!byEvent.has(c.event)) byEvent.set(c.event, [])
    byEvent.get(c.event).push(c)
  }
  const orderedEvents = EVENT_ORDER.filter(e => byEvent.has(e))
  // Append any non-standard events at the tail.
  for (const e of byEvent.keys()) {
    if (!orderedEvents.includes(e)) orderedEvents.push(e)
  }

  return (
    <div className="flex flex-col gap-0.5">
      {orderedEvents.map(event => (
        <div key={event} className="flex gap-1 items-center flex-wrap">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider">{event}:</span>
          {byEvent.get(event).map((c, i) => (
            <Badge key={`${event}-${c.scope_slug}-${i}`} change={c} />
          ))}
        </div>
      ))}
    </div>
  )
}
