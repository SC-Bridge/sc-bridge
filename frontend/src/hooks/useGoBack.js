import { useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Returns a handler that navigates back to wherever the user came from
 * (browser history) instead of a hard-coded destination.
 *
 * Falls back to `fallback` only when there is no in-app history to return to —
 * e.g. the user landed directly via a bookmark, an external link, or a page
 * refresh. React Router gives that initial entry a location.key of 'default';
 * any in-app navigation produces a random key. So `key !== 'default'` is the
 * signal that `navigate(-1)` will stay inside the app and land where the user
 * actually came from.
 *
 * @param {string} fallback path to use when there's no in-app history
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (location.key && location.key !== 'default') navigate(-1)
    else navigate(fallback)
  }, [navigate, location.key, fallback])
}
