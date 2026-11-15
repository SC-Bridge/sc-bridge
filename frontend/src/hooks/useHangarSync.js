import { useState, useEffect, useCallback, useRef } from 'react'

const ALLOWED_SOURCE = 'sc-bridge-sync'
const DETECT_TIMEOUT = 3000 // ms to wait for pong
// Wait this long after `collecting` starts before showing the
// "open RSI hangar tab?" hint. The bridge writes the mailbox command
// instantly; if the hangar.content script were loaded it would log
// "Mailbox sync triggered" and start scraping within seconds. 8s is
// long enough to skip transient page loads but short enough not to
// strand a user with a stuck spinner. Total sync timeout is still 10
// minutes — this just upgrades the in-progress message at the 8s mark.
const NO_PROGRESS_HINT_MS = 8000
// RSI hangar URL the user needs open for the scrape to run.
export const RSI_HANGAR_URL = 'https://robertsspaceindustries.com/account/pledges'
// Only accept postMessage from our own origin (same-origin extension bridge content script)
const isAllowedOrigin = (origin) =>
  origin === window.location.origin || origin === ''

/** Default sync categories — all enabled */
export const SYNC_CATEGORIES = {
  fleet: { key: 'fleet', label: 'Fleet & Pledges', description: 'Ships, vehicles, insurance, skins, and pledge details', default: true },
  buyback: { key: 'buyback', label: 'Buy-Back Pledges', description: 'Melted pledges available for reclaim', default: true },
  upgrades: { key: 'upgrades', label: 'Upgrade History', description: 'CCU chains and applied upgrades per pledge', default: true },
  account: { key: 'account', label: 'Account Info', description: 'Concierge level, subscriber status, org, balances', default: true },
  shipNames: { key: 'shipNames', label: 'Custom Ship Names', description: 'Your named ships (e.g. Jean-Luc, James Holden)', default: true },
}

export default function useHangarSync() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [extensionVersion, setExtensionVersion] = useState(null)
  // True when the scrape is taking longer than NO_PROGRESS_HINT_MS without
  // a result. Used to show the "open RSI hangar tab" hint without blocking
  // the existing spinner — sync stays in `collecting` so the rest of the
  // state machine is unchanged.
  const [showHangarHint, setShowHangarHint] = useState(false)
  const listenerRef = useRef(null)
  const timeoutRef = useRef(null)
  const hintTimerRef = useRef(null)
  const statusRef = useRef(status)
  const categoriesRef = useRef(null)
  // The scraped payload is held while the user answers the mapping dialog, so the
  // extension does not have to scrape again.
  const payloadRef = useRef(null)
  const [mapping, setMapping] = useState(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    return () => {
      if (listenerRef.current) window.removeEventListener('message', listenerRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  const detect = useCallback(() => {
    setStatus('detecting')
    setError(null)

    if (listenerRef.current) window.removeEventListener('message', listenerRef.current)

    const handler = (event) => {
      if (!isAllowedOrigin(event.origin)) return
      if (event.data?.source !== ALLOWED_SOURCE) return
      if (event.data?.type === 'SCBRIDGE_PONG') {
        setStatus('ready')
        setExtensionVersion(event.data.version || null)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
      }
    }

    listenerRef.current = handler
    window.addEventListener('message', handler)

    // Send multiple PINGs — bridge content script may not be injected yet on first load
    window.postMessage({ type: 'SCBRIDGE_PING', source: 'scbridge-app' }, '*')
    const pingInterval = setInterval(() => {
      if (statusRef.current !== 'detecting') { clearInterval(pingInterval); return }
      window.postMessage({ type: 'SCBRIDGE_PING', source: 'scbridge-app' }, '*')
    }, 500)

    timeoutRef.current = setTimeout(() => {
      clearInterval(pingInterval)
      if (statusRef.current === 'detecting') {
        setStatus('no-extension')
      }
    }, DETECT_TIMEOUT)
  }, [])

  useEffect(() => { detect() }, [detect])

  // POST the held payload. `target` is only sent after the user has answered the
  // mapping dialog: { mode: 'new' } or { mode: 'map', rsi_account_id }.
  const upload = useCallback(async (payload, target) => {
    setStatus('uploading')
    try {
      const res = await fetch('/api/import/hangar-sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target ? { ...payload, target } : payload),
      })

      if (res.status === 401) {
        window.location.href = '/login'
        return
      }

      if (res.status === 409) {
        const body = await res.json().catch(() => null)
        if (body?.error === 'needs_mapping') {
          setMapping(body)
          setStatus('needs_mapping')
          return
        }
        throw new Error(body?.error || res.statusText)
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || res.statusText)
      }

      const data = await res.json()
      payloadRef.current = null
      setMapping(null)
      setResult(data)
      setStatus('complete')
    } catch (err) {
      payloadRef.current = null
      setMapping(null)
      setError(err.message)
      setStatus('error')
    }
  }, [])

  const resolveMapping = useCallback((target) => {
    if (!payloadRef.current) return Promise.resolve()
    return upload(payloadRef.current, target)
  }, [upload])

  const cancelMapping = useCallback(() => {
    payloadRef.current = null
    setMapping(null)
    setStatus('ready')
  }, [])

  const startSync = useCallback((categories) => {
    if (statusRef.current !== 'ready' && statusRef.current !== 'complete' && statusRef.current !== 'error') return

    categoriesRef.current = categories || null
    setStatus('collecting')
    setError(null)
    setResult(null)
    setShowHangarHint(false)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)

    // After 8s of `collecting` with no result, show a hint that the user
    // probably needs the RSI hangar tab open. The hangar.content script
    // only loads on /account/pledges*; without that tab open the mailbox
    // command sits unread and we hang for the full 10-minute timeout.
    hintTimerRef.current = setTimeout(() => {
      if (statusRef.current === 'collecting') setShowHangarHint(true)
    }, NO_PROGRESS_HINT_MS)

    if (listenerRef.current) window.removeEventListener('message', listenerRef.current)

    const handler = async (event) => {
      if (!isAllowedOrigin(event.origin)) return
      if (event.data?.source !== ALLOWED_SOURCE) return

      if (event.data?.type === 'SCBRIDGE_SYNC_RESPONSE') {
        window.removeEventListener('message', handler)
        listenerRef.current = null
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
        setShowHangarHint(false)

        if (event.data.error) {
          setError(event.data.error)
          setStatus('error')
          return
        }

        const payload = event.data.payload
        const cats = categoriesRef.current
        if (cats && payload) {
          if (cats.fleet === false) payload.pledges = []
          if (cats.buyback === false) payload.buyback_pledges = []
          if (cats.upgrades === false) payload.upgrades = []
          if (cats.account === false) payload.account = null
          if (cats.shipNames === false) payload.named_ships = []
        }

        payloadRef.current = payload
        await upload(payload, undefined)
      }
    }

    listenerRef.current = handler
    window.addEventListener('message', handler)

    window.postMessage({ type: 'SCBRIDGE_SYNC_REQUEST', source: 'scbridge-app' }, '*')

    timeoutRef.current = setTimeout(() => {
      if (statusRef.current === 'collecting') {
        // Tailor the error to whether we already gave the hangar-tab hint —
        // if the user got that hint and still hit the hard timeout, the
        // tab really is missing.
        setError(
          showHangarHint
            ? 'Sync timed out — open your RSI hangar at robertsspaceindustries.com/account/pledges and try again.'
            : 'Sync timed out — the extension took too long to respond.',
        )
        setStatus('error')
        setShowHangarHint(false)
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
        if (listenerRef.current) {
          window.removeEventListener('message', listenerRef.current)
          listenerRef.current = null
        }
      }
    }, 600000) // 10 min — large hangars (600+ pledges) need time for RSI page loading + buyback collection
  }, [showHangarHint, upload])

  /**
   * Open the RSI hangar in a new tab so the extension's hangar.content
   * script gets injected and can pick up the pending mailbox command.
   * Returns the focused window reference (or null if the popup was blocked).
   */
  const openHangarTab = useCallback(() => {
    return window.open(RSI_HANGAR_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const retry = useCallback(() => {
    if (statusRef.current === 'no-extension') {
      detect()
    } else {
      startSync()
    }
  }, [detect, startSync])

  return {
    status,
    error,
    result,
    mapping,
    resolveMapping,
    cancelMapping,
    extensionVersion,
    showHangarHint,
    startSync,
    retry,
    detect,
    openHangarTab,
  }
}
