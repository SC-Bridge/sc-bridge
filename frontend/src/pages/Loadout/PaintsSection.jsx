import { useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { useShipPaints, useOwnedPaints, equipFleetPaint } from '../../hooks/useAPI'
import ItemImage from '../../components/ItemImage'
import { paintThumb, pickerPaints, isEquipped, equipTarget } from '../../lib/paints'

/**
 * PaintsSection — paint selector for a fleet entry on /loadout.
 *
 * Renders the hull's default paint (its Standard livery, or a special
 * edition's own livery) first, then the paints the user OWNS (strict gate
 * per Gavin) that are compatible with the ship via paint_vehicles. Clicking
 * a paint equips it via PATCH /api/vehicles/:id/paint. The default is stored
 * as NULL, so picking it (or clicking the equipped paint) goes back to it;
 * there is no separate Unequip.
 *
 * Caller responsibilities:
 *   - Pass fleetId so we know which entry to equip on.
 *   - Pass shipSlug so we can fetch the compatible paint list.
 *   - Pass rsiAccountId (the fleet entry's) so only paints on that account are offered.
 *   - Pass equippedPaintId so we can highlight the current selection.
 *   - Pass shipImage: a Standard livery has no image of its own.
 *   - Pass onEquipped() callback that re-fetches the fleet entry after a
 *     successful change (parent decides how — useFleet refetch, hard reload,
 *     local state, etc.).
 *
 * Renders nothing when the ship has no default and the user owns no
 * compatible paint (clean fall-through; the parent decides whether to show
 * an empty state).
 */
export default function PaintsSection({ shipSlug, fleetId, equippedPaintId, rsiAccountId, shipImage, onEquipped }) {
  const { data: shipPaints, loading: paintsLoading } = useShipPaints(shipSlug)
  const { ownedSet, ownedPaints: ownedRows, loading: ownedLoading } = useOwnedPaints()
  const [busyPaintId, setBusyPaintId] = useState(null)
  const [error, setError] = useState(null)

  if (paintsLoading || ownedLoading) return null
  if (!shipPaints?.length) return null

  // The server only lets a ship equip paints held on its own RSI account.
  // The hull's default needs no ownership row, so pickerPaints offers it regardless.
  const accountPaintIds = rsiAccountId != null
    ? new Set(ownedRows.filter(r => r.rsi_account_id === rsiAccountId).map(r => r.paint_id))
    : ownedSet
  const paints = pickerPaints(shipPaints, accountPaintIds)
  if (paints.length === 0) return null

  async function handleEquip(paint) {
    if (busyPaintId) return
    const target = equipTarget(paint, equippedPaintId)
    if (target === equippedPaintId) return
    setError(null)
    setBusyPaintId(paint.id)
    try {
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
          Paints <span className="text-gray-500 font-normal">({paints.length})</span>
        </span>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-400 bg-rose-500/5 border-b border-rose-500/20">
          {error}
        </div>
      )}

      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {paints.map((paint) => {
          const equipped = isEquipped(paint, equippedPaintId)
          const isBusy = busyPaintId === paint.id
          const thumb = paintThumb(paint, shipImage)
          return (
            <button
              key={paint.id}
              type="button"
              onClick={() => handleEquip(paint)}
              disabled={busyPaintId !== null}
              title={equipped
                ? (paint.is_default ? "Equipped (the ship's default paint)" : 'Click to go back to the default paint')
                : `Equip ${paint.name}`}
              className={`relative bg-sc-surface rounded overflow-hidden text-left transition-all border disabled:cursor-not-allowed ${
                equipped
                  ? 'border-emerald-500/60 ring-2 ring-emerald-500/30'
                  : 'border-sc-border/40 hover:border-sc-border'
              } ${isBusy ? 'opacity-60' : ''}`}
            >
              <div className="aspect-square flex items-center justify-center bg-sc-bg relative">
                {thumb || paint.render
                  ? <ItemImage render={paint.render} src={thumb} alt={paint.name} aspectRatio="square" />
                  : <Palette className="w-8 h-8 text-gray-600" />
                }
                {equipped && (
                  <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-display uppercase tracking-wide bg-emerald-500/90 text-white">
                    <Check className="w-2.5 h-2.5" />
                    Equipped
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs font-mono text-gray-300 truncate" title={paint.name}>{paint.name}</p>
                {!!paint.is_default && (
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Default</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
