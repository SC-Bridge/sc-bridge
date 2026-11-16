import React from 'react'
import { Database, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { formatDate } from '../../lib/dates'
import { accountColor } from '../../lib/accounts'

// Per-account sync table, shown only with 2+ RSI accounts. Each account carries
// its own server-computed name, colour, last sync and row counts.
function AccountSyncTable({ accounts }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
            <th className="py-1 pr-3 font-medium">Account</th>
            <th className="py-1 pr-3 font-medium">Last synced</th>
            <th className="py-1 pr-3 font-medium text-right">Ships</th>
            <th className="py-1 pr-3 font-medium text-right">Pledges</th>
            <th className="py-1 font-medium text-right">Buy-backs</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a, i) => (
            <tr key={a.id} className="border-t border-white/[0.06]">
              <td className="py-1.5 pr-3 text-white">
                <span className="inline-flex items-center gap-2">
                  <span
                    data-testid="account-dot"
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: accountColor(a, i) }}
                    aria-hidden="true"
                  />
                  {a.name}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-white font-mono text-xs">
                {a.synced_at ? formatDate(a.synced_at) : 'Never'}
              </td>
              <td className="py-1.5 pr-3 text-white font-mono text-right">{a.ship_count}</td>
              <td className="py-1.5 pr-3 text-white font-mono text-right">{a.pledge_count}</td>
              <td className="py-1.5 text-white font-mono text-right">{a.buyback_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SyncDataSection({ syncStatus, onDelete, notification, multiAccount = false }) {
  const accounts = syncStatus?.accounts ?? []
  const showAccounts = multiAccount && accounts.length >= 2
  return (
    <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-5 shadow-lg shadow-black/20 animate-stagger-fade-up" style={{ animationDelay: '120ms' }}>
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-sc-accent/10 rounded-tl-xl" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-sc-accent/10 rounded-br-xl" />

      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400 mb-4 flex items-center gap-2">
        <Database className="w-3.5 h-3.5 text-sc-accent" />
        Sync Data
      </h2>

      {notification && (
        <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 text-sm ${
          notification.variant === 'error' ? 'bg-sc-danger/10 border border-sc-danger/20 text-sc-danger' :
          notification.variant === 'success' ? 'bg-sc-success/10 border border-sc-success/20 text-sc-success' :
          'text-gray-300'
        }`}>
          {notification.variant === 'success' && <CheckCircle className="w-4 h-4" />}
          {notification.variant === 'error' && <XCircle className="w-4 h-4" />}
          {notification.msg}
        </div>
      )}

      {syncStatus?.has_data ? (
        <div className="space-y-4">
          {showAccounts && <AccountSyncTable accounts={accounts} />}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Fleet ships</span>
              <span className="text-white font-mono">{syncStatus.fleet_count}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Buy-back pledges</span>
              <span className="text-white font-mono">{syncStatus.buyback_count}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">RSI profile</span>
              <span className="text-white font-mono">{syncStatus.has_profile ? 'Yes' : 'No'}</span>
            </div>
            {syncStatus.last_synced && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Last synced</span>
                <span className="text-white font-mono text-xs">{formatDate(syncStatus.last_synced)}</span>
              </div>
            )}
          </div>

          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-sc-danger/30 text-sc-danger hover:bg-sc-danger/10 transition-colors text-sm font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All Synced Data
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          No synced data. Use SC Bridge Sync above to import your RSI hangar.
        </p>
      )}
    </div>
  )
}
