import { DEFAULT_TAGS, TAG_LABELS, CATEGORY_LABELS } from '../constants'

// Post-categorize tag prompt (UX doc B.1) for categories that carry tags.
export default function TagPicker({ category, onPick, onSkip, onCancel }) {
  const tags = DEFAULT_TAGS[category] ?? []
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
              onClick={() => onPick(t)}
              className="border border-sc-border rounded px-3 py-1.5 text-sm text-gray-300 hover:border-sc-accent/60"
            >
              {TAG_LABELS[t] ?? t}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-sm text-gray-500 px-2 py-1">Cancel</button>
          <button onClick={onSkip} className="text-sm text-gray-300 px-2 py-1">No tag</button>
        </div>
      </div>
    </div>
  )
}
