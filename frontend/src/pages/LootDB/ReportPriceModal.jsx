import { useState, useMemo } from 'react'
import { X, Search, Loader, Store } from 'lucide-react'
import { useShopList, reportItemPrice } from '../../hooks/useAPI'

/**
 * Modal for submitting a community price report (#139). The user picks a shop
 * and enters a buy and/or sell price; it's saved as source='user' and surfaces
 * alongside UEX / SC-Companion data.
 */
export default function ReportPriceModal({ uuid, itemName, onClose, onSubmitted }) {
  const { data: shops, loading: shopsLoading } = useShopList()
  const [query, setQuery] = useState('')
  const [shopId, setShopId] = useState(null)
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selectedShop = useMemo(
    () => (shops || []).find(s => s.id === shopId) || null,
    [shops, shopId]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return (shops || [])
      .filter(s => {
        const name = (s.display_name || s.name || '').toLowerCase()
        const loc = (s.location_label || '').toLowerCase()
        return name.includes(q) || loc.includes(q)
      })
      .slice(0, 25)
  }, [shops, query])

  const canSubmit = shopId != null && (buyPrice !== '' || sellPrice !== '') && !saving

  const handleSubmit = async () => {
    setError(null)
    setSaving(true)
    try {
      await reportItemPrice(uuid, {
        shopId,
        buyPrice: buyPrice === '' ? null : Number(buyPrice),
        sellPrice: sellPrice === '' ? null : Number(sellPrice),
      })
      onSubmitted?.()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to submit report')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md panel p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-display font-bold text-white">Report price & location</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 break-words">{itemName}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shop picker */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-display uppercase tracking-wider text-gray-500">Shop</label>
          {selectedShop ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sc-accent/5 border border-sc-accent/20">
              <span className="flex items-center gap-2 text-xs text-gray-200 min-w-0">
                <Store className="w-3.5 h-3.5 text-sc-accent shrink-0" />
                <span className="truncate">{selectedShop.display_name || selectedShop.name}</span>
                {selectedShop.location_label && (
                  <span className="text-[10px] text-gray-500 shrink-0">— {selectedShop.location_label}</span>
                )}
              </span>
              <button onClick={() => { setShopId(null); setQuery('') }} className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0">change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={shopsLoading ? 'Loading shops…' : 'Search shops by name or location…'}
                disabled={shopsLoading}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/30 border border-sc-border text-xs text-gray-200 placeholder-gray-600 focus:border-sc-accent/40 focus:outline-none"
              />
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg bg-[#0d1117] border border-sc-border shadow-xl">
                  {matches.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setShopId(s.id); setQuery('') }}
                      className="flex items-center justify-between gap-2 w-full text-left px-3 py-2 hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-xs text-gray-200 truncate">{s.display_name || s.name}</span>
                      {s.location_label && <span className="text-[10px] text-gray-500 shrink-0">{s.location_label}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-display uppercase tracking-wider text-gray-500">Buy price (aUEC)</label>
            <input
              type="number" min="0" inputMode="numeric"
              value={buyPrice}
              onChange={e => setBuyPrice(e.target.value)}
              placeholder="—"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-sc-border text-xs text-gray-200 placeholder-gray-600 focus:border-sc-accent/40 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-display uppercase tracking-wider text-gray-500">Sell price (aUEC)</label>
            <input
              type="number" min="0" inputMode="numeric"
              value={sellPrice}
              onChange={e => setSellPrice(e.target.value)}
              placeholder="—"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-sc-border text-xs text-gray-200 placeholder-gray-600 focus:border-sc-accent/40 focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sc-accent/15 text-sc-accent border border-sc-accent/30 hover:bg-sc-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Submit report
          </button>
        </div>
      </div>
    </div>
  )
}
