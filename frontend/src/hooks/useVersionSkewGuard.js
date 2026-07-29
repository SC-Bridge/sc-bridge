import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStatus } from './useAPI'

// Version-skew guard. The bundle carries the build id it was compiled from
// (vite define); the worker reports the currently deployed id on /api/status.
// A mismatch means this tab is running a stale bundle: reload it at the next
// safe moment (route navigation — nothing in-flight, nothing half-dragged),
// or offer a toast if the user stays put. sessionStorage keeps one reload
// per server build so a broken deploy can never cause a reload loop.
export const CLIENT_BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

const RELOADED_KEY = 'skew-reloaded-for'
const FOCUS_RECHECK_MS = 60_000

export function decideSkewAction({ clientBuild, serverBuild, reloadedFor }) {
  if (!serverBuild || typeof serverBuild !== 'string') return 'none'
  if (serverBuild === clientBuild) return 'none'
  // "dev" on either side means a non-CI build — ids carry no meaning.
  if (serverBuild === 'dev' || clientBuild === 'dev') return 'none'
  if (reloadedFor === serverBuild) return 'toast'
  return 'reload'
}

function getReloadedFor() {
  try { return sessionStorage.getItem(RELOADED_KEY) } catch { return null }
}

function markReloadedFor(build) {
  try { sessionStorage.setItem(RELOADED_KEY, build) } catch { /* no-op */ }
}

// Returns { stale, reloadNow } for the toast: `stale` is true whenever the tab
// runs an outdated bundle; `reloadNow` is the toast's action.
export function useVersionSkewGuard() {
  const location = useLocation()
  const { data: status, refetch } = useStatus()
  const serverBuild = status?.build
  const [stale, setStale] = useState(false)
  const lastFocusCheck = useRef(0)

  // Re-check when the tab regains focus (long-lived background tabs are the
  // main skew audience), throttled so focus flapping doesn't spam the API.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastFocusCheck.current < FOCUS_RECHECK_MS) return
      lastFocusCheck.current = now
      refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  // Mismatch handling. Auto-reload on any detected mismatch, including the
  // landing render — a stale bundle is exactly as stale on first paint as
  // it is after a route change. The sessionStorage guard (one reload per
  // server build) prevents a reload loop; a broken deploy degrades to the
  // toast instead of reloading forever.
  useEffect(() => {
    const action = decideSkewAction({
      clientBuild: CLIENT_BUILD,
      serverBuild,
      reloadedFor: getReloadedFor(),
    })
    if (action === 'none') {
      setStale(false)
      return
    }
    setStale(true)
    if (action === 'reload') {
      markReloadedFor(serverBuild)
      window.location.reload()
    }
  }, [serverBuild, location.pathname])

  const reloadNow = () => {
    if (serverBuild) markReloadedFor(serverBuild)
    window.location.reload()
  }

  return { stale, reloadNow }
}
