// frontend/src/pages/FpsLoadout/SavedBuilds.jsx
import React, { useState } from 'react'

// Saved weapon-bench builds palette. Backed by /api/weapon-builds (Plan C).
export default function SavedBuilds({ items = [], onLoad, onDelete, onSave, canSave = false }) {
  const [name, setName] = useState('')

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setName('')
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs uppercase tracking-wider text-gray-500">Saved Builds</h4>

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Build name"
          disabled={!canSave}
          className="flex-1 px-2 py-1 text-xs rounded border border-white/10 bg-transparent text-white placeholder-gray-600 disabled:opacity-40"
        />
        <button type="button" onClick={save} disabled={!canSave || !name.trim()}
          className="px-2.5 py-1 text-xs rounded border border-sc-accent/40 text-sc-accent hover:bg-sc-accent/10 disabled:opacity-40 disabled:cursor-not-allowed">
          Save
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-gray-600">No saved builds yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-gray-300">{b.name}</span>
              <button type="button" onClick={() => onLoad(b)}
                className="px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white">Load</button>
              <button type="button" onClick={() => onDelete(b)}
                className="px-2 py-0.5 rounded border border-white/10 text-gray-500 hover:text-red-400">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
