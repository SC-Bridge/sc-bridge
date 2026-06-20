import React, { useState, useMemo, useCallback } from 'react'
import { useSession } from '../lib/auth-client'
import {
  useLootCollection, setLootCollectionQuantity,
  useLootWishlist, toggleLootWishlist,
  useLootCrafted, updateBlueprintBuild,
} from './useAPI'
import DetailPanel from '../pages/LootDB/DetailPanel'

/**
 * Reusable item-detail slide-over for pages outside LootDB (e.g. Fleet Chat).
 * Bundles the collection/wishlist/crafted hooks + handlers that DetailPanel
 * needs, and renders the panel in place. Returns:
 *   openDetail(uuid) — open the pane for a loot uuid
 *   detailNode       — the slide-over element (render it once in your tree)
 */
export function useLootDetailPane() {
  const { data: session } = useSession()
  const isAuthed = !!session?.user
  const { data: collectionIds, refetch: refetchCollection } = useLootCollection(isAuthed)
  const { data: wishlistItems, refetch: refetchWishlist } = useLootWishlist(isAuthed)
  const { data: craftedMap, refetch: refetchCrafted } = useLootCrafted(isAuthed)

  const [detailUuid, setDetailUuid] = useState(null)

  const collected = useMemo(
    () => new Map((collectionIds ?? []).map((e) => [e.loot_uuid, e.quantity])),
    [collectionIds],
  )
  const wishlistIds = useMemo(() => new Set((wishlistItems ?? []).map((i) => i.uuid)), [wishlistItems])

  const handleSetCollectionQty = useCallback(async (uuid, qty) => {
    try { await setLootCollectionQuantity(uuid, qty); refetchCollection() } catch { /* ignore */ }
  }, [refetchCollection])
  const handleToggleWishlist = useCallback(async (uuid, isWishlisted) => {
    try { await toggleLootWishlist(uuid, isWishlisted); refetchWishlist() } catch { /* ignore */ }
  }, [refetchWishlist])
  const handleSetBuildQty = useCallback(async (buildId, qty) => {
    try { await updateBlueprintBuild(buildId, { craftedQuantity: Math.max(0, qty) }); refetchCrafted() } catch { /* ignore */ }
  }, [refetchCrafted])

  const openDetail = useCallback((uuid) => setDetailUuid(uuid), [])

  const detailNode = detailUuid ? (
    <DetailPanel
      uuid={detailUuid}
      build={null}
      manufacturerName={null}
      collectionQty={collected.get(detailUuid) ?? 0}
      craftedQty={craftedMap?.[detailUuid] ?? 0}
      onSetCollectionQty={handleSetCollectionQty}
      onSetBuildQty={handleSetBuildQty}
      wishlisted={wishlistIds.has(detailUuid)}
      onToggleWishlist={handleToggleWishlist}
      isAuthed={isAuthed}
      onClose={() => setDetailUuid(null)}
    />
  ) : null

  return { openDetail, detailNode }
}
