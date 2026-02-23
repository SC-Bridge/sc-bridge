import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAIAnalysisHistory, deleteAIAnalysis } from '../hooks/useAPI'
import useTimezone from '../hooks/useTimezone'
import { formatDate } from '../lib/dates'
import { Clock, Sparkles, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'

export default function AnalysisHistory() {
  const { timezone } = useTimezone()
  const { data, loading, error, refetch } = useAIAnalysisHistory()
  const [expandedId, setExpandedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [notification, setNotification] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false })

  const handleDelete = (id, e) => {
    e.stopPropagation()

    setConfirmDialog({
      open: true,
      title: 'Delete Analysis',
      message: 'Are you sure you want to delete this analysis? This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        setDeleting(id)
        try {
          await deleteAIAnalysis(id)
          await refetch()
          if (expandedId === id) {
            setExpandedId(null)
          }
        } catch (err) {
          setNotification({ msg: 'Failed to delete analysis: ' + err.message, variant: 'error' })
          setTimeout(() => setNotification(null), 3000)
        } finally {
          setDeleting(null)
        }
      },
    })
  }

  if (loading) return <LoadingState message="Loading history..." />
  if (error) return <ErrorState message={error} />

  const history = data?.history || []

  if (history.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="ANALYSIS HISTORY"
          subtitle="Past AI fleet analyses"
        />
        <EmptyState
          icon={Sparkles}
          message="No analyses yet. Generate your first AI fleet analysis!"
          large
          actionLink={{ label: 'Go to Analysis', to: '/analysis' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ANALYSIS HISTORY"
        subtitle={`Past AI fleet analyses (${history.length} total)`}
      />

      {notification && (
        <div className="panel p-4 flex items-center gap-2 text-sm animate-fade-in border-sc-danger/30 text-sc-danger">
          {notification.msg}
        </div>
      )}

      <div className="space-y-3">
        {history.map((item) => {
          const isExpanded = expandedId === item.id
          const formattedDate = formatDate(item.created_at, timezone)

          return (
            <div key={item.id} className="panel">
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-4 text-left">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-sc-accent flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}

                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-sm font-mono text-gray-400">{formattedDate}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-sc-accent" />
                    <span className="text-xs text-gray-500">
                      {item.provider} / {item.model}
                    </span>
                  </div>

                  <span className="text-xs text-gray-400">
                    {item.vehicle_count} ships
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    disabled={deleting === item.id}
                    className="p-1.5 rounded hover:bg-sc-danger/10 text-gray-500 hover:text-sc-danger transition-colors disabled:opacity-50"
                    title="Delete this analysis"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-xs text-gray-400">
                    {isExpanded ? 'Hide' : 'View'}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-sc-border p-5">
                  <div className="prose-fleet">
                    <ReactMarkdown>{item.analysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog({ open: false })}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
      />
    </div>
  )
}
