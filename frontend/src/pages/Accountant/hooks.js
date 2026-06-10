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
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch { /* keep status message */ }
    throw new Error(message)
  }
  return res.json()
}

function useGet(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    let cancelled = false
    setLoading(true)
    api('GET', path)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path])

  useEffect(() => refetch(), [refetch])
  return { data, error, loading, refetch }
}

export const useLedger = (queryString) =>
  useGet(`/api/accountant/ledger${queryString ? `?${queryString}` : ''}`)
export const useSorting = () => useGet('/api/accountant/sorting')
export const useBadges = () => useGet('/api/accountant/badges')
export const useTags = () => useGet('/api/accountant/tags')

export const addEntry = (body) => api('POST', '/api/accountant/ledger', body)
export const updateEntry = (id, body) => api('PUT', `/api/accountant/ledger/${id}`, body)
export const deleteEntry = (id) => api('DELETE', `/api/accountant/ledger/${id}`)
export const categorizeEntries = (ids, category, tag) =>
  api('PUT', '/api/accountant/sorting/bulk', { ids, category, tag })
export const createTag = (name) => api('POST', '/api/accountant/tags', { category: 'trading', name })
export const removeTag = (id) => api('DELETE', `/api/accountant/tags/${id}`)
