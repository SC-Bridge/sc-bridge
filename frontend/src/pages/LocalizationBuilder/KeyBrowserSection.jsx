import React, { useState, useEffect, useCallback } from 'react'
import { Search, Loader, ChevronLeft, ChevronRight, Copy, Check, AlertCircle, Pencil, Save, RotateCcw, X, Upload } from 'lucide-react'

const PAGE = 50

// Read-only explorer over the active version's base global.ini with inline
// per-key edits ("My Customizations"). Server-side paginated search (key OR
// value); each row shows the base value, the effective pack override (when
// packs are enabled), and the user's own override — editable in place.
export default function KeyBrowserSection() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [editingKey, setEditingKey] = useState(null)
  const [draft, setDraft] = useState('')
  const [savingKey, setSavingKey] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

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
  }, [debouncedQ, offset, reloadToken])

  const copyKey = useCallback((key) => {
    navigator.clipboard?.writeText(key)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }, [])

  const startEdit = (it) => {
    setEditingKey(it.key)
    setDraft(it.userOverride ?? it.override ?? it.value)
  }
  const cancelEdit = () => { setEditingKey(null); setDraft('') }

  const saveEdit = async (key) => {
    setSavingKey(key)
    try {
      const res = await fetch('/api/localization/override', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: draft }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed')
      setEditingKey(null)
      setReloadToken((t) => t + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingKey(null)
    }
  }

  const resetKey = async (key) => {
    setSavingKey(key)
    try {
      const res = await fetch(`/api/localization/override?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Reset failed')
      if (editingKey === key) setEditingKey(null)
      setReloadToken((t) => t + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingKey(null)
    }
  }

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setImporting(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/localization/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Import failed')
      setImportMsg({ type: 'success', text: body.imported > 0 ? `Imported ${body.imported} customisation${body.imported === 1 ? '' : 's'}` : 'No changes vs the base file' })
      setReloadToken((t) => t + 1)
    } catch (err) {
      setImportMsg({ type: 'error', text: err.message })
    } finally {
      setImporting(false)
    }
  }

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)

  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-sm text-white">Key Browser</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Search the game's localization keys{data?.version ? ` (${data.version})` : ''} and edit any single value. Your edits override everything and flow into your download.
          </p>
        </div>
        <label className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/[0.08] text-xs text-gray-300 hover:border-sc-accent/40 hover:text-sc-accent cursor-pointer" title="Import an edited global.ini — changed lines become your overrides">
          {importing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Import .ini
          <input type="file" accept=".ini,.txt" onChange={onImport} disabled={importing} className="hidden" />
        </label>
      </div>
      {importMsg && (
        <div className={`px-5 py-2 text-xs ${importMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{importMsg.text}</div>
      )}

      <div className="p-4 space-y-4">
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

        <div className="divide-y divide-white/[0.04] border border-white/[0.06] rounded-lg overflow-hidden">
          {items.map((it) => {
            const editing = editingKey === it.key
            const busy = savingKey === it.key
            return (
              <div key={it.key} className="px-3 py-2 hover:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-mono text-sc-accent break-all">{it.key}</code>
                  {it.userOverride !== undefined && (
                    <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-sc-accent/15 text-sc-accent border border-sc-accent/30">custom</span>
                  )}
                  <button onClick={() => copyKey(it.key)} className="shrink-0 text-gray-600 hover:text-gray-300 cursor-pointer" aria-label="Copy key">
                    {copied === it.key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <div className="flex-1" />
                  {!editing && (
                    <button onClick={() => startEdit(it)} className="shrink-0 text-gray-500 hover:text-sc-accent cursor-pointer" aria-label="Edit value">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!editing && it.userOverride !== undefined && (
                    <button onClick={() => resetKey(it.key)} disabled={busy} className="shrink-0 text-gray-500 hover:text-amber-400 cursor-pointer disabled:opacity-40" aria-label="Reset to default">
                      {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {editing ? (
                  <div className="mt-1.5 flex items-start gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      className="flex-1 bg-black/40 border border-sc-accent/30 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-sc-accent/60 resize-y"
                      autoFocus
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => saveEdit(it.key)} disabled={busy} className="p-1 rounded bg-sc-accent/15 text-sc-accent border border-sc-accent/30 hover:bg-sc-accent/25 cursor-pointer disabled:opacity-40" aria-label="Save">
                        {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={cancelEdit} disabled={busy} className="p-1 rounded border border-white/[0.08] text-gray-400 hover:text-gray-200 cursor-pointer disabled:opacity-40" aria-label="Cancel">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-300 mt-0.5 break-words">{it.value}</div>
                    {(it.packs || []).map((p) => (
                      <div key={p.name} className="text-xs text-amber-400/90 mt-0.5 break-words">
                        <span className="text-[10px] uppercase tracking-wide text-amber-500/70 mr-1" title={p.name}>{p.label}</span>{p.value}
                      </div>
                    ))}
                    {it.userOverride !== undefined && (
                      <div className="text-xs text-sc-accent mt-0.5 break-words">
                        <span className="text-[10px] uppercase tracking-wide text-sc-accent/70 mr-1">yours</span>{it.userOverride}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {!loading && items.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-gray-600">No keys match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}
