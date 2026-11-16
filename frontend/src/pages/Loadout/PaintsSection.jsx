import { useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { useShipPaints, useOwnedPaints, equipFleetPaint } from '../../hooks/useAPI'

/**
 * PaintsSection — paint selector for a fleet entry on /loadout.
 *
 * Renders only paints the user OWNS (strict gate per Gavin) AND are
 * compatible with the ship via paint_vehicles. Clicking a paint equips it
 * via PATCH /api/vehicles/:id/paint. Clicking the currently-equipped paint
 * unsets it.
 *
 * Caller responsibilities:
 *   - Pass fleetId so we know which entry to equip on.
 *   - Pass shipSlug so we can fetch the compatible paint list.
 *   - Pass rsiAccountId (the fleet entry's) so only paints on that account are offered.
 *   - Pass equippedPaintId so we can highlight the current selection.
 *   - Pass onEquipped() callback that re-fetches the fleet entry after a
 *     successful change (parent decides how — useFleet refetch, hard reload,
 *     local state, etc.).
 *
 * Renders nothing when:
 *   - User has no compatible paints in their hangar (clean fall-through; the
 *     parent decides whether to show an empty state)
 */
export default function PaintsSection({ shipSlug, fleetId, equippedPaintId, rsiAccountId, onEquipped }) {
  const { data: shipPaints, loading: paintsLoading } = useShipPaints(shipSlug)
  const { ownedSet, ownedPaints: ownedRows, loading: ownedLoading } = useOwnedPaints()
  const [busyPaintId, setBusyPaintId] = useState(null)
  const [error, setError] = useState(null)

  if (paintsLoading || ownedLoading) return null
  if (!shipPaints?.length) return null

  // The server only lets a ship equip paints held on its own RSI account.
  const accountPaintIds = rsiAccountId != null
    ? new Set(ownedRows.filter(r => r.rsi_account_id === rsiAccountId).map(r => r.paint_id))
    : ownedSet
  const ownedPaints = shipPaints.filter(p => accountPaintIds.has(p.id))
  if (ownedPaints.length === 0) return null

  async function handleEquip(paintId) {
    if (busyPaintId) return
    setError(null)
    setBusyPaintId(paintId)
    try {
      // Click the currently-equipped paint to unset it.
      const target = paintId === equippedPaintId ? null : paintId
      await equipFleetPaint(fleetId, target)
      await onEquipped?.()
    } catch (e) {
      setError(e?.message || 'Failed to equip paint')
    } finally {
      setBusyPaintId(null)
    }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-sc-accent" />
          Paints in your hangar <span className="text-gray-500 font-normal">({ownedPaints.length})</span>
        </span>
        {equippedPaintId && (
          <button
            onClick={() => handleEquip(equippedPaintId)}
            disabled={busyPaintId !== null}
            className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-0.5 rounded border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
            title="Remove the currently equipped paint"
          >
            Unequip
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-400 bg-rose-500/5 border-b border-rose-500/20">
          {error}
        </div>
      )}

      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {ownedPaints.map((paint) => {
          const isEquipped = paint.id === equippedPaintId
          const isBusy = busyPaintId === paint.id
          const thumb = paint.image_url_small || paint.image_url_medium || paint.image_url
          return (
            <button
              key={paint.id}
              type="button"
              onClick={() => handleEquip(paint.id)}
              disabled={busyPaintId !== null}
              title={isEquipped ? 'Click to unequip' : `Equip ${paint.name}`}
              className={`relative bg-sc-surface rounded overflow-hidden text-left transition-all border disabled:cursor-not-allowed ${
                isEquipped
                  ? 'border-emerald-500/60 ring-2 ring-emerald-500/30'
                  : 'border-sc-border/40 hover:border-sc-border'
              } ${isBusy ? 'opacity-60' : ''}`}
            >
              <div className="aspect-square flex items-center justify-center bg-sc-bg relative">
                {thumb
                  ? <img src={thumb} alt={paint.name} className="w-full h-full object-cover" />
                  : <Palette className="w-8 h-8 text-gray-600" />
                }
                {isEquipped && (
                  <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-display uppercase tracking-wide bg-emerald-500/90 text-white">
                    <Check className="w-2.5 h-2.5" />
                    Equipped
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs font-mono text-gray-300 truncate">{paint.name}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
