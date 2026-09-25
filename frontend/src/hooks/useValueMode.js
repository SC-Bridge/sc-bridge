import { useSyncExternalStore, useCallback } from 'react'

/**
 * Whether money is shown as what was pledged or what it would melt for.
 *
 * Shared by every surface that prints a fleet total (dashboard overview, fleet
 * page) so flipping it in one place flips it everywhere — otherwise a user
 * reading "melt" on /fleet and "pledge" on the dashboard would think the two
 * numbers disagree.
 *
 * Deliberately NOT synced to the DB like privacy mode: this is a way of reading
 * the page, not a property of the account, and a round trip per toggle would
 * make it feel slow. localStorage is per-browser and that is the right scope.
 */

const KEY = 'sc-bridge-value-mode'
const MODES = ['pledge', 'melt']

let current = load()
const listeners = new Set()

function load() {
  try {
    const v = localStorage.getItem(KEY)
    return MODES.includes(v) ? v : 'pledge'
  } catch {
    // Private windows and blocked site data throw on access.
    return 'pledge'
  }
}

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return current
}

/** Server render has no localStorage; pledge is the safe default. */
function getServerSnapshot() {
  return 'pledge'
}

export function setValueMode(mode) {
  if (!MODES.includes(mode) || mode === current) return
  current = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not persisting is survivable; the toggle still works for this session.
  }
  emit()
}

/**
 * Returns `{ valueMode, isMelt, setValueMode, toggleValueMode }`.
 *
 * Callers that have no melt data (accounts with no pledge rows) should hide the
 * control rather than show a toggle that reads $0 — see `total_melt_value`,
 * which is null in exactly that case.
 */
export default function useValueMode() {
  const valueMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggleValueMode = useCallback(() => {
    setValueMode(getSnapshot() === 'melt' ? 'pledge' : 'melt')
  }, [])
  return { valueMode, isMelt: valueMode === 'melt', setValueMode, toggleValueMode }
}

/** Test seam — resets module state between cases. */
export function __resetValueMode() {
  current = load()
  emit()
}
