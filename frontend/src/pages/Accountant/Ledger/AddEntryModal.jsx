import { useState } from 'react'
import { LEDGER_CATEGORIES, CATEGORY_LABELS, DEFAULT_TAGS, TAG_LABELS } from '../constants'
import { addEntry } from '../hooks'

// Manual entry per UX doc B.1; "Balance adjustment" mode posts a category-less
// source='adjustment' row (the opening-balance mechanism, design §3.1).
export default function AddEntryModal({ onClose, onSaved, preset = {} }) {
  const [direction, setDirection] = useState(preset.direction ?? 'expense')
  const [adjustment, setAdjustment] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(preset.category ?? '')
  const [tag, setTag] = useState(preset.tag ?? '')
  const [occurredAt, setOccurredAt] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const magnitude = Math.abs(parseInt(amount, 10) || 0)
    if (magnitude === 0) {
      setError('Amount must be at least 1')
      return
    }
    setSaving(true)
    setError(null)
    const signed = direction === 'expense' && !adjustment ? -magnitude : magnitude
    const body = {
      amount: signed,
      occurred_at: new Date(occurredAt).toISOString(),
      ...(adjustment
        ? { adjustment: true }
        : { category: category || undefined, tag: tag || undefined }),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      ...(notes ? { notes } : {}),
    }
    try {
      await addEntry(body)
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const tags = category ? DEFAULT_TAGS[category] ?? [] : []

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-sc-dark border border-sc-border rounded-lg p-5 w-full max-w-md space-y-3 animate-fade-in max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-white font-medium">Add Entry</h2>

        {error && <div role="alert" className="text-sm text-sc-danger">{error}</div>}

        <div className="flex gap-4 text-sm text-gray-300">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="direction" checked={direction === 'expense' && !adjustment}
              onChange={() => { setDirection('expense'); setAdjustment(false) }} aria-label="Expense" />
            Expense
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="direction" checked={direction === 'income' && !adjustment}
              onChange={() => { setDirection('income'); setAdjustment(false) }} aria-label="Income" />
            Income
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="direction" checked={adjustment}
              onChange={() => setAdjustment(true)} aria-label="Balance adjustment" />
            Balance adjustment
          </label>
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm text-gray-400 mb-1">Amount (aUEC)</label>
          <input id="amount" type="number" min="1" required value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        {!adjustment && (
          <div>
            <label htmlFor="category" className="block text-sm text-gray-400 mb-1">Category</label>
            <select id="category" required value={category}
              onChange={(e) => { setCategory(e.target.value); setTag('') }}
              className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm">
              <option value="">Select…</option>
              {LEDGER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        )}

        {!adjustment && tags.length > 0 && (
          <div>
            <label htmlFor="tag" className="block text-sm text-gray-400 mb-1">Tag</label>
            <select id="tag" value={tag} onChange={(e) => setTag(e.target.value)}
              className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm">
              <option value="">No tag</option>
              {tags.map((t) => <option key={t} value={t}>{TAG_LABELS[t] ?? t}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="occurredAt" className="block text-sm text-gray-400 mb-1">Date/time</label>
          <input id="occurredAt" type="datetime-local" required value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm text-gray-400 mb-1">Description</label>
          <input id="description" type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm text-gray-400 mb-1">Location</label>
          <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm text-gray-400 mb-1">Notes</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
          <button type="submit" disabled={saving}
            className="bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-4 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50">
            {saving ? 'Recording…' : 'Record'}
          </button>
        </div>
      </form>
    </div>
  )
}
