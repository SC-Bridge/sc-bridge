import React, { useEffect, useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Plus, Minus, RefreshCw } from 'lucide-react'

/**
 * "What's changed in <version>" banner for the Localization page.
 *
 * Fetches /api/localization/diff (auto-resolves previous → current
 * default LIVE patch) and shows the user added / removed / changed
 * keys before they download their merged global.ini. Collapsible;
 * remembers per-version dismiss state in localStorage so the banner
 * stops shouting after the user's read it once.
 */
export default function WhatsChangedBanner() {
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('changed')

  useEffect(() => {
    let cancelled = false
    fetch('/api/localization/diff', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setDiff(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Auto-expand the first time the user sees this patch's diff.
  // Subsequent visits keep it collapsed unless they click it.
  useEffect(() => {
    if (!diff?.to) return
    const seenKey = `scbridge:localization-diff-seen:${diff.to}`
    const seen = localStorage.getItem(seenKey)
    if (!seen) {
      setExpanded(true)
      localStorage.setItem(seenKey, '1')
    }
  }, [diff?.to])

  if (loading) return null
  if (error) return null  // 404 (no previous version) is the common case — render nothing
  if (!diff) return null
  const total = diff.added_count + diff.removed_count + diff.changed_count
  if (total === 0) return null

  return (
    <div className="rounded-lg border border-sc-accent/20 bg-sc-accent/5 overflow-hidden">
      {/* Summary row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-sc-accent/10 transition-colors cursor-pointer text-left"
      >
        <Sparkles className="w-4 h-4 text-sc-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-200">
            <span className="font-medium">What's changed</span>{' '}
            <span className="text-gray-500">in</span>{' '}
            <span className="font-mono text-sc-accent">{diff.to}</span>{' '}
            <span className="text-gray-500">vs</span>{' '}
            <span className="font-mono text-gray-400">{diff.from}</span>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-3">
            <span><span className="text-emerald-400">+{diff.added_count}</span> added</span>
            <span><span className="text-rose-400">−{diff.removed_count}</span> removed</span>
            <span><span className="text-amber-400">~{diff.changed_count}</span> changed</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">Your config still works — re-download to get the new strings.</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="border-t border-sc-accent/20">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.04]">
            <TabPill active={tab === 'changed'} onClick={() => setTab('changed')} tone="amber">
              <RefreshCw className="w-3 h-3" /> Changed {diff.changed_count}
            </TabPill>
            <TabPill active={tab === 'added'} onClick={() => setTab('added')} tone="emerald">
              <Plus className="w-3 h-3" /> Added {diff.added_count}
            </TabPill>
            <TabPill active={tab === 'removed'} onClick={() => setTab('removed')} tone="rose">
              <Minus className="w-3 h-3" /> Removed {diff.removed_count}
            </TabPill>
          </div>

          {/* Tab body */}
          <div className="max-h-[40vh] overflow-y-auto">
            {tab === 'changed' && (
              <>
                <ChangedList items={diff.changed} />
                {diff.placeholder_changed_count > 0 && (
                  <div className="px-4 py-2 text-[11px] text-gray-600 border-t border-white/[0.04]">
                    +{diff.placeholder_changed_count} placeholder housekeeping changes
                    <span className="text-gray-700"> — unfinished CIG strings (&quot;PLACEHOLDER&quot;) that only gained an item tag</span>
                  </div>
                )}
              </>
            )}
            {tab === 'added' && <KeyList items={diff.added} tone="emerald" />}
            {tab === 'removed' && <KeyList items={diff.removed} tone="rose" />}
          </div>
        </div>
      )}
    </div>
  )
}

function TabPill({ active, onClick, tone, children }) {
  const toneStyles = {
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  }
  const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-[0.05em] border transition-all cursor-pointer'
  return (
    <button
      onClick={onClick}
      className={active
        ? `${base} ${toneStyles[tone]}`
        : `${base} bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-200`}
    >
      {children}
    </button>
  )
}

function ChangedList({ items }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-xs text-gray-600">No value changes.</div>
  }
  return (
    <ul className="divide-y divide-white/[0.04]">
      {items.map(c => (
        <li key={c.key} className="px-4 py-2 text-xs">
          <div className="font-mono text-gray-400 truncate" title={c.key}>{c.key}</div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="text-rose-300/80 truncate" title={c.oldValue}>− {c.oldValue}</div>
            <div className="text-emerald-300/80 truncate" title={c.newValue}>+ {c.newValue}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function KeyList({ items, tone }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-xs text-gray-600">Nothing in this bucket.</div>
  }
  const colorClass = tone === 'emerald' ? 'text-emerald-300/80' : 'text-rose-300/80'
  return (
    <ul className="divide-y divide-white/[0.04]">
      {items.map(k => (
        <li key={k} className={`px-4 py-1.5 text-xs font-mono truncate ${colorClass}`} title={k}>{k}</li>
      ))}
    </ul>
  )
}
