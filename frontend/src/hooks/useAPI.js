import { useState, useEffect, useCallback } from 'react'

const BASE = '/api'

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

async function postJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

async function patchJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

async function putJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export function useAPI(path, { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    if (skip) return
    setLoading(true)
    setError(null)
    fetchJSON(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path, skip])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

export function useStatus() {
  return useAPI('/status')
}

export function useShips() {
  return useAPI('/ships')
}

export function useContracts() {
  return useAPI('/contracts')
}

export function useShip(slug) {
  return useAPI(slug ? `/ships/${slug}` : null, { skip: !slug })
}

export function useShipLoadout(slug) {
  return useAPI(slug ? `/ships/${slug}/loadout` : null, { skip: !slug })
}

export function useShipPaints(slug) {
  return useAPI(slug ? `/paints/ship/${slug}` : null, { skip: !slug })
}

export function useFleet() {
  return useAPI('/vehicles')
}

export function useAnalysis(opts) {
  return useAPI('/analysis', opts)
}

export function useSyncStatus() {
  return useAPI('/sync/status')
}

// Sync management (admin)
export async function triggerPaintSync() {
  return postJSON('/sync/paints')
}

export async function triggerRSISync() {
  return postJSON('/sync/rsi')
}

export async function triggerFullSync() {
  return postJSON('/sync/all')
}

export async function importHangarXplor(jsonData) {
  return postJSON('/import/hangarxplor', jsonData)
}

// User Preferences
export function usePreferences(opts) {
  return useAPI('/settings/preferences', opts)
}

export async function setPreferences(prefs) {
  return putJSON('/settings/preferences', prefs)
}

// LLM Configuration
export function useLLMConfig() {
  return useAPI('/settings/llm-config')
}

export async function setLLMConfig(config) {
  return putJSON('/settings/llm-config', config)
}

export async function testLLMConnection(provider, apiKey) {
  return postJSON('/llm/test-connection', { provider, api_key: apiKey })
}

export async function generateAIAnalysis() {
  return postJSON('/llm/generate-analysis')
}

export function useLatestAIAnalysis() {
  return useAPI('/llm/latest-analysis')
}

export function useAIAnalysisHistory() {
  return useAPI('/llm/analysis-history')
}

// Organisation hooks
export function useUserOrgs(opts) {
  return useAPI('/orgs', opts)
}

export function useOrgProfile(slug) {
  return useAPI(slug ? `/orgs/${slug}` : null, { skip: !slug })
}

export function useOrgFleet(slug) {
  return useAPI(slug ? `/orgs/${slug}/fleet` : null, { skip: !slug })
}

export function useOrgMembers(slug) {
  return useAPI(slug ? `/orgs/${slug}/members` : null, { skip: !slug })
}

export function useOrgAnalysis(slug) {
  return useAPI(slug ? `/orgs/${slug}/analysis` : null, { skip: !slug })
}

export function useOrgStats(slug) {
  return useAPI(slug ? `/orgs/${slug}/stats` : null, { skip: !slug })
}

export async function updateShipVisibility(fleetEntryId, updates) {
  return patchJSON(`/vehicles/${fleetEntryId}/visibility`, updates)
}

export async function deleteAIAnalysis(id) {
  const res = await fetch(`${BASE}/llm/analysis/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}
