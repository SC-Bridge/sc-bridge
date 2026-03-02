import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Palette, Globe, Play, AlertCircle, Ticket, Copy, Check } from 'lucide-react'
import { useSyncStatus, triggerPaintSync, triggerRSISync, triggerFullSync } from '../hooks/useAPI'
import useTimezone from '../hooks/useTimezone'
import { formatDate } from '../lib/dates'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import PanelSection from '../components/PanelSection'

const syncActions = [
  { id: 'paints', label: 'Paint Sync', icon: Palette, trigger: triggerPaintSync, description: 'scunpacked paint metadata' },
  { id: 'rsi', label: 'RSI API', icon: Globe, trigger: triggerRSISync, description: 'Ship and paint images from RSI GraphQL API' },
]

function InvitePanel() {
  const [invites, setInvites] = useState([])
  const [generating, setGenerating] = useState(false)
  const [newUrl, setNewUrl] = useState(null)
  const [copied, setCopied] = useState(false)
  const urlRef = useRef(null)

  useEffect(() => {
    fetch('/api/admin/invites', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then(setInvites)
      .catch(() => {})
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    setNewUrl(null)
    setCopied(false)
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const data = await res.json()
      setNewUrl(data.url)
      setInvites((prev) => [{ token: data.token, created_at: new Date().toISOString(), used_at: null }, ...prev])
    } catch {
      // silently fail — user can retry
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    if (!newUrl) return
    navigator.clipboard.writeText(newUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <PanelSection title="Invite Links" icon={Ticket}>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Ticket className="w-3.5 h-3.5" />
            {generating ? 'Generating...' : 'Generate Invite'}
          </button>
        </div>

        {newUrl && (
          <div className="flex items-center gap-2">
            <input
              ref={urlRef}
              readOnly
              value={newUrl}
              onClick={(e) => e.target.select()}
              className="flex-1 px-3 py-2 bg-sc-darker border border-sc-accent/40 rounded text-xs font-mono text-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50 cursor-pointer"
            />
            <button
              onClick={handleCopy}
              className="p-2 border border-sc-border rounded hover:border-sc-accent/40 transition-colors text-gray-400 hover:text-white"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-sc-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {invites.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Invite tokens</caption>
              <thead>
                <tr className="border-b border-sc-border/50">
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-border/30">
                {invites.map((inv) => (
                  <tr key={inv.token} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 text-xs font-mono text-gray-400 truncate max-w-[160px]" title={inv.token}>
                      {inv.token.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">
                      {inv.created_at ? new Date(inv.created_at + 'Z').toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {inv.used_at ? (
                        <span className="text-xs font-mono text-gray-500">Used</span>
                      ) : (
                        <span className="text-xs font-mono text-sc-success">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PanelSection>
  )
}

export default function Admin() {
  const { timezone } = useTimezone()
  const { data: syncHistory, loading, error, refetch } = useSyncStatus()
  const [triggering, setTriggering] = useState(null)
  const [triggerError, setTriggerError] = useState(null)

  const handleTrigger = async (id, triggerFn) => {
    setTriggering(id)
    setTriggerError(null)
    try {
      await triggerFn()
      setTimeout(refetch, 2000)
    } catch (err) {
      setTriggerError(err.message)
    } finally {
      setTriggering(null)
    }
  }

  const handleFullSync = async () => {
    setTriggering('all')
    setTriggerError(null)
    try {
      await triggerFullSync()
      setTimeout(refetch, 5000)
    } catch (err) {
      setTriggerError(err.message)
    } finally {
      setTriggering(null)
    }
  }

  if (loading) return <LoadingState variant="skeleton" />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ADMIN"
        subtitle="Sync management and system controls"
        actions={
          <button
            onClick={handleFullSync}
            disabled={triggering !== null}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5" />
            {triggering === 'all' ? 'Running...' : 'Full Sync'}
          </button>
        }
      />

      {triggerError && (
        <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{triggerError}</span>
        </div>
      )}

      {/* Invite Links */}
      <InvitePanel />

      {/* Manual Sync Triggers */}
      <PanelSection title="Sync Triggers" icon={RefreshCw}>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {syncActions.map(({ id, label, icon: Icon, trigger, description }) => (
            <button
              key={id}
              onClick={() => handleTrigger(id, trigger)}
              disabled={triggering !== null}
              className="flex items-start gap-3 p-3 bg-sc-darker border border-sc-border rounded hover:border-sc-accent/40 transition-all text-left disabled:opacity-50"
            >
              <Icon className="w-4 h-4 text-sc-accent mt-0.5 shrink-0" />
              <div>
                <span className="text-sm font-medium text-white block">
                  {triggering === id ? 'Triggering...' : label}
                </span>
                <span className="text-xs text-gray-500">{description}</span>
              </div>
            </button>
          ))}
        </div>
      </PanelSection>

      {/* Sync History */}
      {syncHistory && syncHistory.length > 0 && (
        <PanelSection title="Sync History" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Data sync history</caption>
              <thead>
                <tr className="border-b border-sc-border/50">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Records</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Started</th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-border/30">
                {syncHistory.map((s, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-2 text-xs font-mono ${
                        s.status === 'success' ? 'text-sc-success' :
                        s.status === 'error' ? 'text-sc-danger' : 'text-sc-warn'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          s.status === 'success' ? 'bg-sc-success' :
                          s.status === 'error' ? 'bg-sc-danger' : 'bg-sc-warn animate-pulse'
                        }`} />
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-300">
                      {s.source_label || s.endpoint}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-gray-400 text-right">
                      {(s.record_count || 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-500">
                      {formatDate(s.started_at, timezone)}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-sc-danger truncate max-w-[200px]" title={s.error_message || ''}>
                      {s.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelSection>
      )}

      {error && (
        <div className="text-center text-gray-500 text-sm py-8">
          Failed to load sync history: {error}
        </div>
      )}
    </div>
  )
}
