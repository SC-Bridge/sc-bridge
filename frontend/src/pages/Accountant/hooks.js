import { useCallback, useEffect, useRef, useState } from 'react'

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    // Session expired — redirect only if a session cookie exists, so public
    // pages that legitimately 401 for anonymous visitors aren't bounced (mirrors useAPI.js).
    if (document.cookie.includes('better-auth.session_token')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
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

  // Cancel handle of the most recent in-flight request, whatever triggered it
  // (mount, a refreshOn event, or a manual refetch() call). Every new request
  // — and every path change — cancels the previous one, so a slow response
  // from a superseded path can never overwrite newer data. Manual refetches
  // participate in the same scheme by going through this ref.
  const inflightCancel = useRef(null)

  const refetch = useCallback(() => {
    inflightCancel.current?.()
    let cancelled = false
    const cancel = () => { cancelled = true }
    inflightCancel.current = cancel
    setLoading(true)
    getJSON(path)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return cancel
  }, [path])

  useEffect(() => {
    refetch()
    // Path change (refetch identity changes) cancels the in-flight request for
    // the old path, so its late response can never land on the new path's data.
    return () => { inflightCancel.current?.() }
  }, [refetch])

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

// M5 orders + workorders — query strings pre-encoded (URLSearchParams.toString()).
export const useOrders = (qs) => useGet(`/api/accountant/orders${qs ? `?${qs}` : ''}`, { refreshOn: 'accountant:changed' })
export const useOrder = (id) => useGet(`/api/accountant/orders/${id}`, { refreshOn: 'accountant:changed' })
export const useWorkorders = (qs) => useGet(`/api/accountant/workorders${qs ? `?${qs}` : ''}`, { refreshOn: 'accountant:changed' })
export const useWorkorder = (id) => useGet(`/api/accountant/workorders/${id}`, { refreshOn: 'accountant:changed' })

export const createOrder = (body) => mutate('POST', '/api/accountant/orders', body)
export const updateOrder = (id, body) => mutate('PUT', `/api/accountant/orders/${id}`, body)
export const cancelOrder = (id) => mutate('POST', `/api/accountant/orders/${id}/cancel`)
export const recordFulfillment = (id, body) => mutate('POST', `/api/accountant/orders/${id}/fulfillments`, body)

export const createWorkorder = (body) => mutate('POST', '/api/accountant/workorders', body)
export const addWorkorderOrders = (id, body) => mutate('POST', `/api/accountant/workorders/${id}/orders`, body)
export const detachWorkorderOrder = (id, orderId) => mutate('DELETE', `/api/accountant/workorders/${id}/orders/${orderId}`)
export const publishWorkorder = (id) => mutate('POST', `/api/accountant/workorders/${id}/publish`)
export const cancelWorkorder = (id) => mutate('POST', `/api/accountant/workorders/${id}/cancel`)
export const terminateWorkorder = (id, body) => mutate('POST', `/api/accountant/workorders/${id}/terminate`, body)

export const forgiveLoan = (id, body) => mutate('POST', `/api/accountant/loans/${id}/forgive`, body)
