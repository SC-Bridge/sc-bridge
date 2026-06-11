import { useState } from 'react'
import { DEFAULT_TAGS, TAG_LABELS, CATEGORY_LABELS } from '../constants'

// Post-categorize tag prompt (UX doc B.1) for categories that carry tags.
// For running_cost only, an optional note captures what the cost relates to
// (which ship, player, or location). The note is forwarded with onPick/onSkip.
export default function TagPicker({ category, onPick, onSkip, onCancel }) {
  const tags = DEFAULT_TAGS[category] ?? []
  const [note, setNote] = useState('')
  const showNote = category === 'running_cost'
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        data-testid="tag-picker"
        onClick={(e) => e.stopPropagation()}
        className="bg-sc-dark border border-sc-border rounded-lg p-5 w-full max-w-sm space-y-3 animate-fade-in"
      >
        <h2 className="text-white font-medium">Tag for {CATEGORY_LABELS[category]}</h2>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => onPick({ tag: t, note: showNote ? note : undefined })}
              className="border border-sc-border rounded px-3 py-1.5 text-sm text-gray-300 hover:border-sc-accent/60"
            >
              {TAG_LABELS[t] ?? t}
            </button>
          ))}
        </div>
        {showNote && (
          <div>
            <label htmlFor="tag-picker-note" className="block text-sm text-gray-400 mb-1">
              Ship / player / location
            </label>
            <input
              id="tag-picker-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Carrack, Jean-Luc, Port Tressler"
              className="w-full bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-sm text-gray-500 px-2 py-1">Cancel</button>
          <button onClick={() => onSkip({ note: showNote ? note : undefined })} className="text-sm text-gray-300 px-2 py-1">No tag</button>
        </div>
      </div>
    </div>
  )
}
