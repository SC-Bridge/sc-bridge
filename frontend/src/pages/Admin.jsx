import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Palette, Globe, Play, AlertCircle, Ticket, Copy, Check, Database, Image } from 'lucide-react'
import { useSyncStatus, triggerPaintSync, triggerRSISync, triggerFullSync, triggerFleetyardsSync, triggerHangarPaintSync, setPreferences } from '../hooks/useAPI'
import useTimezone from '../hooks/useTimezone'
import useGameVersion from '../hooks/useGameVersion'
import { formatVersionLabel, formatVersionFull } from '../lib/gameVersion'
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

function FleetyardsSyncPanel() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const handleSync = async () => {
    setRunning(true)
    setError(null)
    setProgress({ totalUploaded: 0, skipped: 0, remaining: '...', failed: [] })

    let totalUploaded = 0
    let totalSkipped = 0
    let allFailed = []
    let iterations = 0
    let consecutiveErrors = 0

    while (true) {
      iterations++
      try {
        const result = await triggerFleetyardsSync()
        consecutiveErrors = 0
        totalUploaded += result.uploaded
        totalSkipped = result.skippedExisting
        allFailed = [...allFailed, ...result.failed]

        setProgress({
          totalUploaded,
          skipped: totalSkipped,
          remaining: result.remaining,
          failed: allFailed,
          iteration: iterations,
        })

        if (result.remaining === 0 || result.uploaded === 0) break
        if (iterations > 50) break
      } catch (err) {
        consecutiveErrors++
        setProgress((prev) => ({ ...prev, iteration: iterations, lastError: err.message }))
        if (consecutiveErrors >= 3) {
          setError(`Stopped after ${consecutiveErrors} consecutive errors: ${err.message}`)
          break
        }
        // Brief pause before retry
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    setRunning(false)
  }

  return (
    <PanelSection title="Fleetyards Paint Sync" icon={Image}>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={running}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Image className="w-3.5 h-3.5" />
            {running ? 'Syncing...' : 'Sync Paint Images'}
          </button>
          <span className="text-xs text-gray-500">
            Fetches from Fleetyards API → uploads to CF Images (loops automatically)
          </span>
        </div>

        {progress && (
          <div className="text-xs font-mono space-y-1 p-3 bg-sc-darker border border-sc-border rounded">
            <div className="flex items-center gap-2">
              {running && <RefreshCw className="w-3 h-3 text-sc-accent animate-spin" />}
              <span className={running ? 'text-sc-accent' : 'text-sc-success'}>
                {running ? `Batch ${progress.iteration}...` : 'Complete'}
              </span>
            </div>
            <div className="text-gray-400">
              Uploaded: <span className="text-white">{progress.totalUploaded}</span>
              {' · '}Already had: <span className="text-white">{progress.skipped}</span>
              {' · '}Remaining: <span className="text-white">{progress.remaining}</span>
            </div>
            {progress.failed.length > 0 && (
              <div className="text-sc-danger mt-1">
                {progress.failed.length} failed: {progress.failed.slice(0, 3).join(', ')}
                {progress.failed.length > 3 && ` +${progress.failed.length - 3} more`}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-sc-danger">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </PanelSection>
  )
}

// THROWAWAY — delete after use. 5 remaining PNG-only paints from RSI hangar.
const HANGAR_PAINTS = [{"class_name":"Paint_Avenger_Luminalia_2952_Green_Red","mediaId":"w9c4om0bvajj0"},{"class_name":"Paint_Avenger_Luminalia_2952_White_Blue","mediaId":"1qqwjjxz25c3h"},{"class_name":"Paint_Nomad_Luminalia_2952_Green_Red","mediaId":"u3h9nl284k6qw"},{"class_name":"Paint_Starfighter_Red_White_Pink_Crusader","mediaId":"j10ststnouqb0"},{"class_name":"Paint_Starfighter_White_Blue_Blue_microTech","mediaId":"cw9xjggz6h0i0"}]

function HangarPaintSyncPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const BATCH_SIZE = 10

  const handleSync = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    let totalUploaded = 0
    const allFailed = []
    try {
      for (let i = 0; i < HANGAR_PAINTS.length; i += BATCH_SIZE) {
        const batch = HANGAR_PAINTS.slice(i, i + BATCH_SIZE)
        const res = await triggerHangarPaintSync(batch)
        totalUploaded += res.uploaded || 0
        if (res.failed?.length) allFailed.push(...res.failed)
        setResult({ uploaded: totalUploaded, failed: allFailed, batch: Math.floor(i / BATCH_SIZE) + 1, totalBatches: Math.ceil(HANGAR_PAINTS.length / BATCH_SIZE) })
      }
      setResult({ uploaded: totalUploaded, failed: allFailed, done: true })
    } catch (err) {
      setResult({ uploaded: totalUploaded, failed: allFailed })
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <PanelSection title="Hangar Paint Sync" icon={Image}>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={running}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Image className="w-3.5 h-3.5" />
            {running ? `Uploading batch ${result?.batch || 1}/${Math.ceil(HANGAR_PAINTS.length / BATCH_SIZE)}...` : `Upload ${HANGAR_PAINTS.length} Paints`}
          </button>
          <span className="text-xs text-gray-500">
            RSI hangar media IDs → CF Images (source quality, one-shot)
          </span>
        </div>

        {result && (
          <div className="text-xs font-mono space-y-1 p-3 bg-sc-darker border border-sc-border rounded">
            <div className="text-sc-success">{result.done ? 'Complete' : `Batch ${result.batch}/${result.totalBatches}...`}</div>
            <div className="text-gray-400">
              Uploaded: <span className="text-white">{result.uploaded}</span>
              {' · '}Failed: <span className={result.failed?.length ? 'text-sc-danger' : 'text-white'}>{result.failed?.length || 0}</span>
            </div>
            {result.failed?.length > 0 && (
              <div className="text-sc-danger mt-1">
                {result.failed.slice(0, 5).join(', ')}
                {result.failed.length > 5 && ` +${result.failed.length - 5} more`}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-sc-danger">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </PanelSection>
  )
}

function DataVersionsPanel() {
  const { versions, defaultVersion, activeCode, isPreview, setPreviewPatch } = useGameVersion()
  const [selectedDefault, setSelectedDefault] = useState('')
  const [selectedPreview, setSelectedPreview] = useState('')
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (defaultVersion) setSelectedDefault(defaultVersion.code)
  }, [defaultVersion])

  useEffect(() => {
    if (isPreview) setSelectedPreview(activeCode)
  }, [isPreview, activeCode])

  const handleSetDefault = async () => {
    if (!selectedDefault) return
    setSaving('default')
    setError(null)
    try {
      const res = await fetch('/api/admin/versions/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: selectedDefault }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to set default version')
      }
      window.location.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleSetPreview = async () => {
    if (!selectedPreview) return
    setSaving('preview')
    setError(null)
    try {
      await setPreviewPatch(selectedPreview)
    } catch (err) {
      setError(err.message)
      setSaving(null)
    }
  }

  const handleClearPreview = async () => {
    setSaving('clear')
    setError(null)
    try {
      await setPreviewPatch(null)
    } catch (err) {
      setError(err.message)
      setSaving(null)
    }
  }

  if (versions.length === 0) return null

  return (
    <PanelSection title="Data Versions" icon={Database}>
      <div className="p-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-2 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Public default */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Public Game Version</label>
          <div className="flex items-center gap-2">
            <select
              value={selectedDefault}
              onChange={(e) => setSelectedDefault(e.target.value)}
              className="flex-1 px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            >
              {versions.map((v) => (
                <option key={v.code} value={v.code}>
                  {formatVersionFull(v.code, v.channel)}{v.is_default ? ' (current)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleSetDefault}
              disabled={saving || selectedDefault === defaultVersion?.code}
              className="btn-primary text-sm px-3 py-2 disabled:opacity-50"
            >
              {saving === 'default' ? 'Saving...' : 'Set Default'}
            </button>
          </div>
        </div>

        {/* Admin preview */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin Preview Version</label>
          <div className="flex items-center gap-2">
            <select
              value={selectedPreview}
              onChange={(e) => setSelectedPreview(e.target.value)}
              className="flex-1 px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            >
              <option value="">None (use public default)</option>
              {versions.map((v) => (
                <option key={v.code} value={v.code}>
                  {formatVersionFull(v.code, v.channel)}
                </option>
              ))}
            </select>
            <button
              onClick={handleSetPreview}
              disabled={saving || !selectedPreview}
              className="btn-primary text-sm px-3 py-2 disabled:opacity-50"
            >
              {saving === 'preview' ? 'Saving...' : 'Preview'}
            </button>
            {isPreview && (
              <button
                onClick={handleClearPreview}
                disabled={saving}
                className="px-3 py-2 text-sm border border-sc-border rounded text-gray-400 hover:text-white hover:border-sc-accent/40 transition-colors disabled:opacity-50"
              >
                {saving === 'clear' ? 'Clearing...' : 'Clear'}
              </button>
            )}
          </div>
          {isPreview && (
            <p className="text-[10px] text-amber-400">
              Preview active — you are viewing {formatVersionFull(activeCode)} data instead of the public default.
            </p>
          )}
        </div>
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

      {/* Data Versions */}
      <DataVersionsPanel />

      {/* Invite Links */}
      <InvitePanel />

      {/* Paint Sync panels (throwaway — delete after use) */}
      <FleetyardsSyncPanel />
      <HangarPaintSyncPanel />


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
