import React, { useState, useEffect, useCallback } from 'react'
import { Search, Loader, ChevronLeft, ChevronRight, Copy, Check, AlertCircle } from 'lucide-react'

const PAGE = 50

// Read-only explorer over the active version's base global.ini. Server-side
// paginated search (key OR value); when community packs are enabled the
// effective pack override for a key is shown alongside the base value.
export default function KeyBrowserSection() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  // Debounce the query; reset to the first page whenever it changes.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setOffset(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debouncedQ) params.set('q', debouncedQ)
    params.set('offset', String(offset))
    params.set('limit', String(PAGE))
    fetch(`/api/localization/keys?${params}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Search failed')
        return r.json()
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQ, offset])

  const copyKey = useCallback((key) => {
    navigator.clipboard?.writeText(key)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }, [])

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border">
        <h3 className="font-display font-semibold text-sm text-white">Key Browser</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Search the game's localization keys{data?.version ? ` (${data.version})` : ''}. Matches the key name or its text.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search keys or values… e.g. Gladius, item_Name, Repeater"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sc-accent/40"
          />
          {loading && <Loader className="w-4 h-4 animate-spin text-sc-accent absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Result count + pagination */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total > 0 ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : (loading ? 'Searching…' : 'No matches')}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              disabled={offset === 0}
              className="p-1 rounded border border-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed hover:border-white/[0.12] cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOffset((o) => (o + PAGE < total ? o + PAGE : o))}
              disabled={to >= total}
              className="p-1 rounded border border-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed hover:border-white/[0.12] cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="divide-y divide-white/[0.04] border border-white/[0.06] rounded-lg overflow-hidden">
          {items.map((it) => (
            <div key={it.key} className="px-3 py-2 hover:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <code className="text-[11px] font-mono text-sc-accent break-all">{it.key}</code>
                <button
                  onClick={() => copyKey(it.key)}
                  className="shrink-0 text-gray-600 hover:text-gray-300 cursor-pointer"
                  aria-label="Copy key"
                >
                  {copied === it.key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-xs text-gray-300 mt-0.5 break-words">{it.value}</div>
              {it.override !== undefined && (
                <div className="text-xs text-amber-400/90 mt-0.5 break-words">
                  <span className="text-[10px] uppercase tracking-wide text-amber-500/70 mr-1">pack</span>
                  {it.override}
                </div>
              )}
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-gray-600">No keys match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}
