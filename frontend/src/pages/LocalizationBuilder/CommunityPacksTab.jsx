import React, { useState } from 'react'
import { Send, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import CommunityPacksSection from './CommunityPacksSection'
import { KEY_CATEGORIES } from './constants'

// Optional advanced control: route specific string categories to specific
// packs. The chosen pack wins for keys in that category, over the wholesale
// enabled-pack merge.
function CategoryAssignment({ packs, categoryPacks, onSetCategoryPack }) {
  if (!packs || packs.length === 0) return null
  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border">
        <h3 className="font-display font-semibold text-sm text-white">Per-Category Assignment <span className="text-[10px] font-mono text-gray-500">advanced</span></h3>
        <p className="text-xs text-gray-500 mt-0.5">Route a string category to a specific pack — it wins for those keys over your enabled packs.</p>
      </div>
      <div className="p-4 space-y-2">
        {KEY_CATEGORIES.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-300">{cat.label}</span>
            <select
              value={(categoryPacks || {})[cat.id] || ''}
              onChange={(e) => onSetCategoryPack(cat.id, e.target.value)}
              className="w-56 px-2 py-1 bg-sc-darker border border-sc-border rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            >
              <option value="">Default (enabled packs)</option>
              {packs.map((p) => (
                <option key={p.name} value={p.name}>{p.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

function RequestPackForm() {
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const submit = async () => {
    if (!url.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/localization/pack-request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), note: note.trim() || undefined }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
      setResult({ type: 'success', text: "Thanks! Your request was sent — we'll take a look." })
      setUrl('')
      setNote('')
    } catch (e) {
      setResult({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border">
        <h3 className="font-display font-semibold text-sm text-white">Request a Pack</h3>
        <p className="text-xs text-gray-500 mt-0.5">Found a community localization pack you'd like added? Drop the link and we'll take a look.</p>
      </div>
      <div className="p-4 space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/… or other pack link"
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sc-accent/40"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note — what does it add?"
          maxLength={1000}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sc-accent/40"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={submitting || !url.trim()}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Request
          </button>
          {result && (
            <span className={`flex items-center gap-1.5 text-xs ${result.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {result.type === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {result.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CommunityPacksTab({ packs, enabledPacks, onTogglePack, categoryPacks, onSetCategoryPack }) {
  return (
    <div className="space-y-6">
      <CommunityPacksSection packs={packs} enabledPacks={enabledPacks} onTogglePack={onTogglePack} />
      <CategoryAssignment packs={packs} categoryPacks={categoryPacks} onSetCategoryPack={onSetCategoryPack} />
      <RequestPackForm />
    </div>
  )
}
