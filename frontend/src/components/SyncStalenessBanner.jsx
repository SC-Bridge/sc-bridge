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
 *
 * With 2+ RSI accounts it judges each account's own sync and names only the
 * stale ones among `accountIds` (a Set of account ids; null = all accounts).
 */
export default function SyncStalenessBanner({ accountIds = null }) {
  const { data, loading, error } = useUserSyncStatus()
  if (loading || error || !data) return null

  const accounts = data.accounts ?? []
  const multi = accounts.length >= 2

  let message
  if (multi) {
    const stale = accounts.filter(
      (a) => (!accountIds || accountIds.has(a.id)) && isSyncStale(a.synced_at),
    )
    if (stale.length === 0) return null
    message = (
      <>
        {stale.length === 1 ? 'This RSI account has' : 'These RSI accounts have'} not synced recently:{' '}
        {stale.map((a, i) => (
          <React.Fragment key={a.id}>
            {i > 0 && ', '}
            <strong className="text-white">{a.name}</strong> ({describeSyncAge(syncAgeDays(a.synced_at))})
          </React.Fragment>
        ))}
        . Melt values, insurance and buy-backs may have changed since.
      </>
    )
  } else {
    const lastSynced = data.last_synced
    if (!isSyncStale(lastSynced)) return null
    const age = describeSyncAge(syncAgeDays(lastSynced))
    message = (
      <>
        Your RSI hangar was last synced <strong className="text-white">{age}</strong>.
        Melt values, insurance and buy-backs may have changed since.
      </>
    )
  }

  return (
    <div role="alert">
      <AlertBanner variant="warning" icon={Clock}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-gray-300">{message}</span>
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
