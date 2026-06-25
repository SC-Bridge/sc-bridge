import React, { useMemo } from 'react'
import { History } from 'lucide-react'
import { useChangelog } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { groupChangelogByDate, categoryMeta } from './changelogHelpers'

function formatDate(iso) {
  // iso is YYYY-MM-DD — render as "6 June 2026" without timezone surprises.
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${d} ${months[m - 1]} ${y}`
}

export default function Changelog() {
  const { data: entries, loading, error, refetch } = useChangelog()
  const groups = useMemo(() => groupChangelogByDate(entries), [entries])

  if (loading) return <LoadingState message="Loading changelog..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="CHANGELOG"
        subtitle="What's new in SC Bridge"
        actions={<History className="w-5 h-5 text-gray-500" />}
      />

      {groups.length === 0 && (
        <p className="text-sm text-gray-500">No changelog entries yet.</p>
      )}

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.date} className="space-y-3">
            <div className="flex items-baseline gap-3 border-b border-sc-border/40 pb-2">
              <h2 className="text-sm font-display uppercase tracking-widest text-gray-300">
                {formatDate(group.date)}
              </h2>
              {group.version && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-sc-border text-gray-400">
                  v{group.version}
                </span>
              )}
            </div>

            <ul className="space-y-3">
              {group.entries.map((entry) => {
                const meta = categoryMeta(entry.category)
                return (
                  <li key={entry.id} className="flex gap-3">
                    <span className={`shrink-0 mt-0.5 text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded border h-fit ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200">{entry.title}</p>
                      {entry.description && (
                        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{entry.description}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
