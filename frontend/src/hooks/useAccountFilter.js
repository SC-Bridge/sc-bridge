import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_KEY = 'scb.accountFilter'

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // storage blocked: the selection still lives in the URL
  }
}

// Turn an 'all' / '1,3' string into a set of owned account ids, or null when
// nothing valid remains.
function parseSelection(raw, accounts) {
  if (!raw) return null
  const owned = new Set(accounts.map((a) => a.id))
  if (raw === 'all') return owned
  const picked = new Set(
    raw.split(',').map((s) => Number(s.trim())).filter((n) => owned.has(n)),
  )
  return picked.size > 0 ? picked : null
}

const serialise = (ids, accounts) =>
  ids.size === accounts.length ? 'all' : [...ids].sort((a, b) => a - b).join(',')

/**
 * Which RSI accounts a page shows. Selection lives in the `accts` URL param
 * ('all' or '1,3') and is remembered in localStorage; with neither, the primary
 * account is shown. Inactive (everything matches) until the user has 2+ accounts.
 */
export default function useAccountFilter(accounts) {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = Array.isArray(accounts) && accounts.length >= 2
  const urlValue = searchParams.get('accts')

  const selectedIds = useMemo(() => {
    if (!active) return new Set()
    const primary = accounts.find((a) => a.is_primary) ?? accounts[0]
    return (
      parseSelection(urlValue, accounts)
      ?? (urlValue ? null : parseSelection(readStored(), accounts))
      ?? new Set([primary.id])
    )
  }, [active, accounts, urlValue])

  const isAll = active && selectedIds.size === accounts.length
  const apiParam = active ? serialise(selectedIds, accounts) : null

  const commit = useCallback((ids) => {
    const value = serialise(ids, accounts)
    writeStored(value)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('accts', value)
      next.delete('page')
      return next
    }, { replace: true })
  }, [accounts, setSearchParams])

  const toggle = useCallback((id) => {
    if (!active) return
    const next = new Set(selectedIds)
    if (next.has(id)) {
      if (next.size === 1) return
      next.delete(id)
    } else {
      next.add(id)
    }
    commit(next)
  }, [active, selectedIds, commit])

  const selectAll = useCallback(() => {
    if (active) commit(new Set(accounts.map((a) => a.id)))
  }, [active, accounts, commit])

  const matches = useCallback(
    (rsiAccountId) => !active || rsiAccountId == null || selectedIds.has(rsiAccountId),
    [active, selectedIds],
  )

  return { active, selectedIds, isAll, apiParam, toggle, selectAll, matches }
}
