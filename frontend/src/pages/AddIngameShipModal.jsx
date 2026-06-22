import React, { useMemo, useState } from 'react'
import { X, Check, Plus, Search } from 'lucide-react'
import { useShips, addIngameShip } from '../hooks/useAPI'

/**
 * Modal for adding in-game-purchased ships to the fleet. Search the full ship
 * catalogue and click to add — stays open so several can be added in one go
 * (a wipe often means re-buying a handful). Each add is tagged source='ingame'.
 */
export default function AddIngameShipModal({ onClose, onAdded }) {
  const { data: ships } = useShips()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(null)
  const [added, setAdded] = useState({}) // vehicle_id → count added this session
  const [error, setError] = useState(null)

  const results = useMemo(() => {
    const list = (ships || []).filter((s) => s.id && s.name)
    const q = query.trim().toLowerCase()
    const filtered = q
      ? list.filter((s) => `${s.name} ${s.manufacturer_name || ''}`.toLowerCase().includes(q))
      : list
    return filtered.slice(0, 60)
  }, [ships, query])

  async function handleAdd(ship) {
    setError(null)
    setAdding(ship.id)
    try {
      await addIngameShip(ship.id)
      setAdded((a) => ({ ...a, [ship.id]: (a[ship.id] || 0) + 1 }))
      onAdded?.()
    } catch (e) {
      setError(e.message || 'Failed to add ship')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-sc-panel border border-white/10 rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h2 className="font-hud text-sm uppercase tracking-wider text-white">Add In-Game Ship</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Ships bought with aUEC. They survive re-imports and can be cleared after a wipe.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ships…"
              className="w-full bg-white/[0.04] border border-white/10 rounded pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sc-accent/40"
            />
          </div>
          {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
        </div>

        <div className="overflow-y-auto divide-y divide-white/[0.04]">
          {results.length === 0 && (
            <p className="text-sm text-gray-500 px-4 py-6 text-center">No ships match “{query}”.</p>
          )}
          {results.map((ship) => {
            const count = added[ship.id] || 0
            return (
              <div key={ship.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03]">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200 block truncate">{ship.name}</span>
                  <span className="text-[11px] text-gray-500">
                    {ship.manufacturer_name}{ship.focus ? ` · ${ship.focus}` : ''}{ship.size_label ? ` · ${ship.size_label}` : ''}
                  </span>
                </div>
                {count > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">
                    <Check className="w-3 h-3" /> Added{count > 1 ? ` ×${count}` : ''}
                  </span>
                )}
                <button
                  onClick={() => handleAdd(ship)}
                  disabled={adding === ship.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-sc-accent/15 hover:bg-sc-accent/25 text-sc-accent border border-sc-accent/30 rounded transition-colors disabled:opacity-50 cursor-pointer flex-shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 rounded transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
