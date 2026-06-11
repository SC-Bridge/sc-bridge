import { useCallback, useEffect, useState } from 'react'

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `${method} ${path} failed: ${res.status}`
    let details
    try {
      const data = await res.json()
      if (data.error) message = data.error
      details = data
    } catch { /* keep status message */ }
    const err = new Error(message)
    err.details = details
    throw err
  }
  return res.json()
}

// Concurrent identical GETs (e.g. both sidebars mounting SortingNavBadge)
// share one in-flight request instead of hitting the API twice.
const inflight = new Map()
function getJSON(path) {
  if (inflight.has(path)) return inflight.get(path)
  const p = api('GET', path).finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

// Mutations announce themselves so count-driven hooks (useBadges) can refetch.
async function mutate(method, path, body) {
  const res = await api(method, path, body)
  window.dispatchEvent(new Event('accountant:changed'))
  return res
}

function useGet(path, { refreshOn } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    let cancelled = false
    setLoading(true)
    getJSON(path)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path])

  useEffect(() => refetch(), [refetch])

  useEffect(() => {
    if (!refreshOn) return undefined
    const handler = () => refetch()
    window.addEventListener(refreshOn, handler)
    return () => window.removeEventListener(refreshOn, handler)
  }, [refreshOn, refetch])

  return { data, error, loading, refetch }
}

// queryString must be pre-encoded (e.g. URLSearchParams.toString()) — it is appended verbatim.
export const useLedger = (queryString) =>
  useGet(`/api/accountant/ledger${queryString ? `?${queryString}` : ''}`)
export const useSorting = () => useGet('/api/accountant/sorting', { refreshOn: 'accountant:changed' })
export const useBadges = () => useGet('/api/accountant/badges', { refreshOn: 'accountant:changed' })
export const useTags = () => useGet('/api/accountant/tags')

export const addEntry = (body) => mutate('POST', '/api/accountant/ledger', body)
export const updateEntry = (id, body) => mutate('PUT', `/api/accountant/ledger/${id}`, body)
export const deleteEntry = (id) => mutate('DELETE', `/api/accountant/ledger/${id}`)
export const categorizeEntries = (ids, category, { tag, note } = {}) =>
  mutate('PUT', '/api/accountant/sorting/bulk', {
    ids,
    category,
    ...(tag !== undefined ? { tag } : {}),
    ...(note ? { note } : {}),
  })
export const createTradingTag = (name) => mutate('POST', '/api/accountant/tags', { category: 'trading', name })
export const removeTag = (id) => mutate('DELETE', `/api/accountant/tags/${id}`)

export const useLoans = () => useGet('/api/accountant/loans', { refreshOn: 'accountant:changed' })
export const useLoan = (id) => useGet(`/api/accountant/loans/${id}`, { refreshOn: 'accountant:changed' })

export const createLoan = (body) => mutate('POST', '/api/accountant/loans', body)
export const updateLoan = (id, body) => mutate('PUT', `/api/accountant/loans/${id}`, body)
export const recordRepayment = (id, body) => mutate('POST', `/api/accountant/loans/${id}/repayments`, body)
export const settleLoan = (id) => mutate('POST', `/api/accountant/loans/${id}/settle`)

// M3 reports — read-only; query string is pre-encoded (URLSearchParams.toString()).
export const useReportPL = (qs) => useGet(`/api/accountant/reports/pl${qs ? `?${qs}` : ''}`)
export const useReportBalance = (qs) => useGet(`/api/accountant/reports/balance${qs ? `?${qs}` : ''}`)
export const useReportNetWorth = (qs) => useGet(`/api/accountant/reports/net-worth${qs ? `?${qs}` : ''}`)
export const useReportCashFlow = (qs) => useGet(`/api/accountant/reports/cash-flow${qs ? `?${qs}` : ''}`)
export const useInvestmentOption = (qs) => useGet(`/api/accountant/reports/investment-option${qs ? `?${qs}` : ''}`)
