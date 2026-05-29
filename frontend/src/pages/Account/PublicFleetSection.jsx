import React, { useEffect, useState } from 'react'
import { Share2, Copy, Check, Link as LinkIcon, ShieldAlert, AlertCircle, Loader2 } from 'lucide-react'
import PanelSection from '../../components/PanelSection'
import { usePreferences, setPreferences } from '../../hooks/useAPI'

/**
 * Share My Fleet — opt-in public read-only fleet page at /u/:handle/fleet.
 *
 * Self-fetching section: pulls verified RSI handle from /api/account/rsi-profile
 * and the publicFleetShare preference via the shared usePreferences hook.
 * Only ships flagged Public on the Fleet page are surfaced by the API; pledge
 * cost and value are never exposed.
 *
 * Requires a verified RSI handle — without one the toggle is hidden and we
 * direct the user to the RSI Profile section above.
 */
export default function PublicFleetSection() {
  const { data: prefs, loading: prefsLoading, refetch: refetchPrefs } = usePreferences()
  const [verifiedHandle, setVerifiedHandle] = useState(null)
  const [rsiLoading, setRsiLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/account/rsi-profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const handle = data?.profile?.verified_handle || null
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
    if (!verifiedHandle) return
    const url = `${window.location.origin}/u/${encodeURIComponent(verifiedHandle)}/fleet`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard blocked — non-critical
    })
  }

  const loading = prefsLoading || rsiLoading
  const shareUrl = verifiedHandle
    ? `${window.location.origin}/u/${encodeURIComponent(verifiedHandle)}/fleet`
    : null

  return (
    <div id="section-public-fleet" className="scroll-mt-16">
      <PanelSection title="Share My Fleet" icon={Share2}>
        <div className="p-5 space-y-4 max-w-2xl">
          <p className="text-sm text-gray-400">
            Publish a read-only fleet page at{' '}
            <code className="text-sc-accent font-mono text-xs">/u/your-handle/fleet</code>.
            Only ships you mark <strong className="text-white">Public</strong> on the Fleet
            page will appear. Pledge prices and ship values are never shared.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && !verifiedHandle && (
            <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/30 rounded text-amber-400 text-sm">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Verify your RSI handle in the Star Citizen Profile section above before you can
                share a public fleet link.
              </span>
            </div>
          )}

          {!loading && verifiedHandle && (
            <>
              <label className="flex items-center gap-3 cursor-pointer select-none">
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
                <div className="flex items-center gap-2 p-3 bg-sc-darker border border-sc-border rounded">
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
                    {copied ? (
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
            </>
          )}
        </div>
      </PanelSection>
    </div>
  )
}
