import { useState, useEffect, useCallback } from 'react'

const BASE = '/api'

async function apiFetch(method, path, body) {
  const opts = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
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

const fetchJSON = (path) => apiFetch('GET', path)
const postJSON = (path, body) => apiFetch('POST', path, body)
const patchJSON = (path, body) => apiFetch('PATCH', path, body)
const putJSON = (path, body) => apiFetch('PUT', path, body)

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

export async function triggerFleetyardsSync() {
  return postJSON('/admin/sync/fleetyards-paints')
}

export async function triggerHangarPaintSync(paints) {
  return postJSON('/admin/sync/hangar-paints', { paints })
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

// Loot / Item Finder
// These hooks accept an optional patchCode to query a specific game version.
// When patchCode changes, the path changes, triggering a re-fetch.
export function useLoot(patchCode) {
  const suffix = patchCode ? `?patch=${encodeURIComponent(patchCode)}` : ''
  return useAPI(`/loot${suffix}`)
}

export function useLootItem(uuid, patchCode) {
  const suffix = patchCode ? `?patch=${encodeURIComponent(patchCode)}` : ''
  return useAPI(uuid ? `/loot/${uuid}${suffix}` : null, { skip: !uuid })
}

export function useLootLocations(patchCode) {
  const suffix = patchCode ? `?patch=${encodeURIComponent(patchCode)}` : ''
  return useAPI(`/loot/locations${suffix}`)
}

export function useLootLocationDetail(type, slug, patchCode) {
  const suffix = patchCode ? `?patch=${encodeURIComponent(patchCode)}` : ''
  const path = type && slug ? `/loot/locations/${type}/${encodeURIComponent(slug)}${suffix}` : null
  return useAPI(path, { skip: !type || !slug })
}

export function useLootCollection(isAuthed) {
  return useAPI('/loot/collection', { skip: !isAuthed })
}

export async function toggleLootCollection(uuid, isCurrentlyCollected) {
  return apiFetch(isCurrentlyCollected ? 'DELETE' : 'POST', `/loot/collection/${uuid}`)
}

export async function setLootCollectionQuantity(uuid, quantity) {
  return patchJSON(`/loot/collection/${uuid}`, { quantity })
}

export async function setLootWishlistQuantity(uuid, quantity) {
  return patchJSON(`/loot/wishlist/${uuid}`, { quantity })
}

export function useLootWishlist(isAuthed) {
  return useAPI('/loot/wishlist', { skip: !isAuthed })
}

export async function toggleLootWishlist(uuid, isCurrentlyWishlisted) {
  return apiFetch(isCurrentlyWishlisted ? 'DELETE' : 'POST', `/loot/wishlist/${uuid}`)
}

export function useLootSet(setSlug, patchCode) {
  const suffix = patchCode ? `?patch=${encodeURIComponent(patchCode)}` : ''
  return useAPI(setSlug ? `/loot/sets/${setSlug}${suffix}` : null, { skip: !setSlug })
}

export async function deleteAIAnalysis(id) {
  return apiFetch('DELETE', `/llm/analysis/${id}`)
}
