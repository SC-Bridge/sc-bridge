import { useState } from 'react'
import { X } from 'lucide-react'
import { CATEGORY_LABELS, LEDGER_CATEGORIES, DEFAULT_TAGS, TAG_LABELS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import { updateEntry } from '../hooks'

export default function EntryDetail({ entry, onClose, onSaved }) {
  const [category, setCategory] = useState(entry.category ?? '')
  const [tag, setTag] = useState(entry.tag ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateEntry(entry.id, {
        category: category || null,
        tag: tag || null,
        notes: notes || null,
      })
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const tags = category ? DEFAULT_TAGS[category] ?? [] : []

  return (
    <div data-testid="entry-detail" className="fixed inset-y-0 right-0 w-96 bg-sc-dark border-l border-sc-border p-5 overflow-y-auto z-40 animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-white font-medium">{entry.description ?? 'Entry'}</h2>
          <p className="text-sm text-gray-400">
            {new Date(entry.occurred_at).toLocaleString()}{entry.location ? ` · ${entry.location}` : ''}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close detail" className="text-gray-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className={`text-lg tabular-nums mb-4 ${signClass(entry.amount)}`}>{formatAUEC(entry.amount)}</p>

      {error && <div role="alert" className="text-sm text-sc-danger mb-3">{error}</div>}

      <label className="block text-sm text-gray-400 mb-1">Category</label>
      <select
        value={category}
        onChange={(e) => { setCategory(e.target.value); setTag('') }}
        className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm mb-3"
      >
        <option value="">Uncategorized</option>
        {LEDGER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>

      {tags.length > 0 && (
        <>
          <label className="block text-sm text-gray-400 mb-1">Tag</label>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm mb-3"
          >
            <option value="">No tag</option>
            {tags.map((t) => <option key={t} value={t}>{TAG_LABELS[t] ?? t}</option>)}
          </select>
        </>
      )}

      <label className="block text-sm text-gray-400 mb-1">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm mb-4"
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded py-2 text-sm hover:bg-sc-accent/30 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}
