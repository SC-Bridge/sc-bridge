import React, { useEffect, useState } from 'react'
import { Share2, Copy, Check, Link as LinkIcon, ShieldAlert, AlertCircle, Loader2, ChevronDown } from 'lucide-react'
import { usePreferences, setPreferences } from '../hooks/useAPI'

/**
 * Share My Fleet — compact banner shown above the Fleet table.
 *
 * Replaces the previous Account-page section. Lives next to the per-ship
 * Public visibility chips so users don't have to bounce between pages to
 * understand the full sharing surface.
 *
 * Requires a verified RSI handle (manual or extension). Without one we
 * collapse to a one-line hint pointing back to Account.
 */
export default function ShareFleetBanner() {
  const { data: prefs, loading: prefsLoading, refetch: refetchPrefs } = usePreferences()
  const [verifiedHandle, setVerifiedHandle] = useState(null)
  const [rsiLoading, setRsiLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/account/rsi-profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const handle =
          data?.profile?.verified_handle ||
          (data?.verification?.verified ? data?.verification?.verified_handle : null) ||
          null
        const isVerified = data?.verification?.verified
        setVerifiedHandle(isVerified ? handle : null)
        setRsiLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setRsiLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const enabled = prefs?.publicFleetShare === 'true'
  const loading = prefsLoading || rsiLoading
  const shareUrl = verifiedHandle
    ? `${window.location.origin}/u/${encodeURIComponent(verifiedHandle)}/fleet`
    : null

  // Auto-expand when sharing is enabled — users want to see the link.
  useEffect(() => { if (enabled) setExpanded(true) }, [enabled])

  async function toggle() {
    if (!verifiedHandle || saving) return
    const next = !enabled
    setSaving(true)
    setError(null)
    try {
      await setPreferences({ publicFleetShare: next ? 'true' : null })
      await refetchPrefs()
    } catch (err) {
      setError(err.message || 'Failed to update preference')
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopyError(false)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        setCopyError(true)
        setTimeout(() => setCopyError(false), 3000)
      })
  }

  if (loading) return null

  // No verified handle — render a quiet one-liner instead of taking up space.
  if (!verifiedHandle) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/5 border border-amber-400/20 rounded text-xs text-amber-300/90">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>
          Verify your RSI handle in <a href="/account#section-rsi" className="text-sc-accent hover:underline">Account</a> to share your fleet publicly.
        </span>
      </div>
    )
  }

  return (
    <div className="bg-sc-darker border border-sc-border rounded">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={expanded}
      >
        <Share2 className="w-4 h-4 text-sc-accent shrink-0" />
        <span className="text-sm font-medium text-white">Share My Fleet</span>
        {enabled && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-sc-accent/20 text-sc-accent font-mono">ON</span>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {enabled ? 'Link active' : 'Off'}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-sc-border/50">
          <p className="text-xs text-gray-400">
            Publish a read-only fleet page. Only ships you mark{' '}
            <strong className="text-white">Public</strong> in the Visibility column below appear.
            Pledge prices and ship values are never shared.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-2 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={toggle}
              disabled={saving}
              className="w-4 h-4 accent-sc-accent"
            />
            <span className="text-sm text-white">Enable public fleet link</span>
            {saving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving…
              </span>
            )}
          </label>

          {enabled && shareUrl && (
            <div className="flex items-center gap-2 p-2 bg-sc-dark border border-sc-border rounded">
              <LinkIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <code className="flex-1 text-xs text-sc-accent font-mono truncate">
                {shareUrl}
              </code>
              <button
                type="button"
                onClick={copyLink}
                className="px-2 py-1 rounded border border-sc-border hover:border-sc-accent/30 hover:bg-sc-accent/10 transition-colors text-xs text-gray-300 flex items-center gap-1 shrink-0"
                title="Copy link"
              >
                {copyError ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-sc-danger" />
                    Failed
                  </>
                ) : copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
