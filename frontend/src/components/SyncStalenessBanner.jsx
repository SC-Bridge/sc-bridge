import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, RefreshCw } from 'lucide-react'
import AlertBanner from './AlertBanner'
import { useUserSyncStatus } from '../hooks/useAPI'
import { syncAgeDays, isSyncStale, describeSyncAge } from '../lib/syncStaleness'

/**
 * "Your hangar snapshot is old" nudge for the Fleet and Hangar pages.
 *
 * Melt values, insurance and buy-back state on those pages come from the
 * last extension sync. When that sync is weeks or months old the page is
 * quietly wrong — a ship melted since then still reads as meltable. This
 * banner says how old the snapshot is and points at the Import page, where
 * the sync button lives. It renders nothing while loading, on error, for
 * users who have never synced (nothing to be stale), and for a fresh sync.
 */
export default function SyncStalenessBanner() {
  const { data, loading, error } = useUserSyncStatus()
  if (loading || error || !data) return null

  const lastSynced = data.last_synced
  if (!isSyncStale(lastSynced)) return null

  const age = describeSyncAge(syncAgeDays(lastSynced))

  return (
    <div role="alert">
      <AlertBanner variant="warning" icon={Clock}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-gray-300">
            Your RSI hangar was last synced <strong className="text-white">{age}</strong>.
            Melt values, insurance and buy-backs may have changed since.
          </span>
          <Link
            to="/sync-import"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-sc-warn/40 text-sc-warn hover:bg-sc-warn/10 transition-colors text-xs font-medium whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Sync now
          </Link>
        </div>
      </AlertBanner>
    </div>
  )
}
