import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react'

const BASE = '/api'

async function apiFetch(method, path, body) {
  const opts = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (res.status === 401) {
    // Only redirect if user had an active session (session expired).
    // Unauthenticated visitors on public pages should not be redirected —
    // the 401 is expected for user-specific endpoints called by layout components.
    const hasSession = document.cookie.includes('better-auth.session_token')
    if (hasSession) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
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

// F212/F253/F263/F297: concurrent mounts of useAPI(path) used to each fire
// their own fetch. Worst offender was /api/settings/preferences (fetched
// 4× per page load — App sidebar, useFontPreference, usePrivacyMode,
// useTimezone). Shared in-flight map dedupes concurrent callers — the
// first mount triggers the fetch, subsequent mounts while it's in flight
// subscribe to the same Promise. No long-lived cache (refetch/invalidation
// semantics stay unchanged) — only the "thundering herd on page load" case
// is fixed.
const inflight = new Map()
function sharedFetchJSON(path) {
  const hit = inflight.get(path)
  if (hit) return hit
  const p = fetchJSON(path).finally(() => {
    // Clear the entry after settle so subsequent refetches always hit the
    // network. The dedupe window is the duration of one round trip.
    if (inflight.get(path) === p) inflight.delete(path)
  })
  inflight.set(path, p)
  return p
}

export function useAPI(path, { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    if (skip) return
    setLoading(true)
    setError(null)
    sharedFetchJSON(path)
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
  // Server defaults to is_npc_only=0 (hides Vanduul/AI/defendship variants).
  // Player-obtainable but non-pledgeable ships (Drake Command Module, Krig
  // L-22 Wikelo War Special, BIS variants) stay visible. Pages that need
  // every entity including NPC spawns can call useAPI('/ships?include_npc=1').
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

/**
 * useOwnedPaints — fetches the current user's owned paint IDs from
 * /api/account/paints. Returns { ownedSet, loading, error, refetch }.
 *
 * Frontend code does `ownedSet.has(paint.id)` for O(1) lookup when
 * rendering paint cards on Ship DB, /fleet, and /loadout. When
 * unauthed the endpoint returns 401 and the hook resolves to an
 * empty set so callers can safely lookup without auth checks.
 */
export function useOwnedPaints() {
  const { data, loading, error, refetch } = useAPI('/account/paints')
  const ownedSet = useMemo(() => {
    if (!data || !Array.isArray(data.owned)) return new Set()
    return new Set(data.owned)
  }, [data])
  return { ownedSet, loading, error, refetch }
}

export function useShipSalvage(slug) {
  return useAPI(slug ? `/ships/${slug}/salvage` : null, { skip: !slug })
}

export function useSalvageableShips() {
  return useAPI('/gamedata/salvageable-ships')
}

export function useCrafting() {
  return useAPI('/gamedata/crafting')
}

export function useMining() {
  return useAPI('/gamedata/mining')
}

export function useWeaponRacks() {
  return useAPI('/gamedata/weapon-racks')
}

export function useSuitLockers() {
  return useAPI('/gamedata/suit-lockers')
}

export function useNPCLoadouts() {
  return useAPI('/gamedata/npc-loadouts')
}

export function useFpsGear() {
  return useAPI('/gamedata/fps-gear')
}

export function useNPCFactionLoadouts(factionCode, page = 1, perPage = 50) {
  return useAPI(
    factionCode ? `/gamedata/npc-loadouts/${factionCode}?page=${page}&per_page=${perPage}` : null,
    { skip: !factionCode },
  )
}

export function usePaints() {
  return useAPI('/paints')
}

export function usePaintDetail(slug) {
  return useAPI(slug ? `/paints/${encodeURIComponent(slug)}` : null, { skip: !slug })
}

export function useFleet() {
  return useAPI('/vehicles')
}

// Loaner ships derived from the user's owned unreleased ships (concept /
// in-production) via the vehicle_loaners matrix. Computed server-side; rows are
// shaped like fleet entries plus `is_derived_loaner` + `loaner_for`.
export function useFleetLoaners() {
  return useAPI('/vehicles/loaners')
}

export function useFleetEntryUpgrades(fleetEntryId) {
  return useAPI(fleetEntryId ? `/vehicles/${fleetEntryId}/upgrades` : null, { skip: !fleetEntryId })
}

export function useAnalysis(opts) {
  return useAPI('/analysis', opts)
}

export function useSyncStatus() {
  return useAPI('/sync/status')
}

// Sync management (admin)
export async function triggerRSISync() {
  return postJSON('/sync/rsi')
}

export async function triggerFullSync() {
  return postJSON('/sync/all')
}

// F279: manual UEX price sync trigger — admin-only, bypasses the 2h cron.
export async function triggerUexSync(type = 'all') {
  return postJSON('/admin/uex/sync', { type })
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

// Sync data management
export function useUserSyncStatus() {
  return useAPI('/settings/sync-status')
}

export async function deleteSyncData() {
  return apiFetch('DELETE', '/settings/sync-data')
}

// Character Backup — CHF files + headshots stored in R2
export function useCharacters() {
  return useAPI('/characters')
}

export async function uploadCharacter(name, chfFile, headshotFile) {
  const form = new FormData()
  form.append('name', name)
  form.append('chf', chfFile)
  if (headshotFile) form.append('headshot', headshotFile)
  const res = await fetch(`${BASE}/characters`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export async function deleteCharacter(id) {
  return apiFetch('DELETE', `/characters/${id}`)
}

export async function uploadCharacterHeadshot(id, headshotFile) {
  const form = new FormData()
  form.append('headshot', headshotFile)
  const res = await fetch(`${BASE}/characters/${id}/headshot`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
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

export async function generateAIAnalysis({ provider, model, context } = {}) {
  return postJSON('/llm/generate-analysis', { provider, model, context })
}

/**
 * Live model list for a provider. Fetched on mount and whenever the provider
 * changes; the backend caches it in KV for 24h. `refresh()` forces a re-fetch
 * (passes ?refresh=1 to bust the server cache) for when a provider ships new
 * models. Returns the static fallback list server-side if the live call fails.
 */
export function useLLMModels(provider) {
  const [models, setModels] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback((refresh = false) => {
    if (!provider) { setModels(null); return }
    setLoading(true)
    setError(null)
    const qs = `provider=${encodeURIComponent(provider)}${refresh ? '&refresh=1' : ''}`
    fetchJSON(`/llm/models?${qs}`)
      .then((d) => setModels(d.models || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [provider])

  useEffect(() => { load(false) }, [load])

  return { models, loading, error, refresh: () => load(true) }
}

export function useLatestAIAnalysis() {
  return useAPI('/llm/latest-analysis')
}

export function useAIAnalysisHistory() {
  return useAPI('/llm/analysis-history')
}

// Fleet chat (saved "Chat about my fleet" conversations)
export function useChats() {
  return useAPI('/llm/chats')
}

export function useChat(id) {
  return useAPI(id ? `/llm/chats/${id}` : '/llm/chats', { skip: !id })
}

export async function sendChatMessage({ chat_id, provider, model, message }) {
  return postJSON('/llm/chat', { chat_id, provider, model, message })
}

export async function deleteChat(id) {
  return apiFetch('DELETE', `/llm/chats/${id}`)
}

export async function renameChat(id, title) {
  return patchJSON(`/llm/chats/${id}`, { title })
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

export function useOrgOps(slug, status) {
  const path = slug ? `/orgs/${slug}/ops${status ? `?status=${status}` : ''}` : null
  return useAPI(path, { skip: !slug })
}

export function useOrgOp(slug, opId) {
  return useAPI(slug && opId ? `/orgs/${slug}/ops/${opId}` : null, { skip: !slug || !opId })
}

export function useOpTypes(slug) {
  return useAPI(slug ? `/orgs/${slug}/ops/types` : null, { skip: !slug })
}

export function usePublicOp(code) {
  return useAPI(code ? `/ops/join/${code}` : null, { skip: !code })
}

export async function updateShipVisibility(fleetEntryId, updates) {
  return patchJSON(`/vehicles/${fleetEntryId}/visibility`, updates)
}

// Bulk set visibility on many ships in one call.
//   body = { mode: 'all', org_visibility }
//   body = { mode: 'entries', entries: [{ id, org_visibility }] }
export async function bulkSetVisibility(body) {
  return patchJSON('/vehicles/bulk-visibility', body)
}

export async function equipFleetPaint(fleetEntryId, paintId) {
  return patchJSON(`/vehicles/${fleetEntryId}/paint`, { paint_id: paintId })
}

export async function updateOrgSettings(slug, settings) {
  return patchJSON(`/orgs/${slug}`, settings)
}

// Org verify-then-create flow
export async function generateOrgVerification(rsiSid) {
  return postJSON('/orgs/verify/generate', { rsiSid })
}

export async function checkOrgVerification() {
  return postJSON('/orgs/verify/check')
}

export function useOrgVerificationStatus() {
  return useAPI('/orgs/verify/status')
}

// Org sync + delete + primary
export async function syncOrgFromRsi(slug) {
  return postJSON(`/orgs/${slug}/sync-rsi`)
}

export async function deleteOrg(slug) {
  return apiFetch('DELETE', `/orgs/${slug}`)
}

export async function setPrimaryOrg(organizationId) {
  return putJSON('/orgs/primary', { organizationId })
}

// Loot / Item Finder
export function useLoot() {
  return useAPI('/loot')
}

export function useLootItem(uuid) {
  return useAPI(uuid ? `/loot/${uuid}` : null, { skip: !uuid })
}

// Player-visitable shop list (id, name, display_name, location_label) for the
// price-report picker.
export function useShopList() {
  return useAPI('/gamedata/shops')
}

// Submit a community price report for an item at a shop (requires auth).
export async function reportItemPrice(uuid, { shopId, buyPrice, sellPrice }) {
  return apiFetch('POST', `/loot/${uuid}/report-price`, { shopId, buyPrice, sellPrice })
}

export function useLootLocations() {
  return useAPI('/loot/locations')
}

export function useLootLocationDetail(type, slug) {
  const path = type && slug ? `/loot/locations/${type}/${encodeURIComponent(slug)}` : null
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

/**
 * Per-loot-uuid crafted counter map for the signed-in user.
 * Returns { [uuid]: number } — uuids missing from the map have zero
 * crafted. Sums user_blueprints.crafted_quantity + every named build.
 */
export function useLootCrafted(isAuthed) {
  return useAPI('/loot/crafted', { skip: !isAuthed })
}

// Per-loot-uuid saved builds (names + made count), incl. made=0. Auth-only.
// Returns { [loot_uuid]: [{ name, crafted }] }. Powers the Item Finder
// "saved build" marker + search-by-build-name.
export function useLootSavedBuilds(isAuthed) {
  return useAPI('/loot/saved-builds', { skip: !isAuthed })
}

/**
 * Hangar inventory — every user_pledge_items row joined to its parent
 * pledge. Returns `{ items, counts, total }`. counts is keyed by kind
 * with NULL bucketed under 'uncategorised'.
 */
export function useHangar() {
  return useAPI('/hangar')
}

export async function toggleLootWishlist(uuid, isCurrentlyWishlisted) {
  return apiFetch(isCurrentlyWishlisted ? 'DELETE' : 'POST', `/loot/wishlist/${uuid}`)
}

export function useLocationShops(locationSlug) {
  return useAPI(locationSlug ? `/gamedata/locations/${locationSlug}/shops` : null, { skip: !locationSlug })
}

/**
 * Unified POI detail hook. Returns a single payload with per-section envelopes
 * (shops / loot_pools / missions / npc_factions / siblings). Accepts either the
 * canonical star_map_locations slug or the container-side alias (e.g.
 * "FloatingIslands" → "stanton2-orison"). See plan:
 * /home/gavin/.claude/plans/curious-popping-toucan.md
 */
export function usePOI(slug) {
  return useAPI(slug ? `/gamedata/poi/${encodeURIComponent(slug)}` : null, { skip: !slug })
}

/**
 * Full uncapped list of POIs under a given parent POI slug. Powers the
 * parent-level "see all" page.
 */
export function usePOIChildren(parentSlug) {
  return useAPI(parentSlug ? `/gamedata/poi/${encodeURIComponent(parentSlug)}/children` : null, { skip: !parentSlug })
}

export function useLootSet(setSlug) {
  return useAPI(setSlug ? `/loot/sets/${setSlug}` : null, { skip: !setSlug })
}

export async function deleteAIAnalysis(id) {
  return apiFetch('DELETE', `/llm/analysis/${id}`)
}

// --- Localization Builder ---

export function useLocalizationConfig() {
  return useAPI('/localization/config')
}

export async function saveLocalizationConfig(config) {
  return putJSON('/localization/config', config)
}

export function useLocalizationShipOrder() {
  return useAPI('/localization/ship-order')
}

export async function saveLocalizationShipOrder(items) {
  return putJSON('/localization/ship-order', { items })
}

export function useLocalizationPreview() {
  return useAPI('/localization/preview')
}

export function useLocalizationPacks() {
  return useAPI('/localization/overlay-packs')
}

// Loadout Builder hooks
export function useLoadoutComponents(slug) {
  return useAPI(slug ? `/loadout/${slug}/components` : null, { skip: !slug })
}

export function useShipModules(slug) {
  return useAPI(slug ? `/loadout/${slug}/modules` : null, { skip: !slug })
}

export function useOwnedModules(slug) {
  return useAPI(slug ? `/loadout/${slug}/modules/owned` : null, { skip: !slug })
}

export function useCompatibleComponents(slug, portId) {
  return useAPI(slug && portId ? `/loadout/${slug}/compatible?port_id=${portId}` : null, { skip: !slug || !portId })
}

export function useFleetLoadout(fleetId) {
  return useAPI(fleetId ? `/loadout/fleet/${fleetId}` : null, { skip: !fleetId })
}

export async function saveFleetLoadout(fleetId, overrides) {
  return putJSON(`/loadout/fleet/${fleetId}`, { overrides })
}

export async function resetFleetLoadout(fleetId) {
  return apiFetch('DELETE', `/loadout/fleet/${fleetId}`)
}

export async function resetFleetLoadoutPort(fleetId, portId) {
  return apiFetch('DELETE', `/loadout/fleet/${fleetId}/port/${portId}`)
}

// Loaner equivalents — derived loaners have no fleet id, so their loadout is
// keyed by the loaner's vehicle id (user_loaner_loadout).
export function useLoanerLoadout(loanerVehicleId) {
  return useAPI(loanerVehicleId ? `/loadout/loaner/${loanerVehicleId}` : null, { skip: !loanerVehicleId })
}

export async function saveLoanerLoadout(loanerVehicleId, overrides) {
  return putJSON(`/loadout/loaner/${loanerVehicleId}`, { overrides })
}

export async function resetLoanerLoadout(loanerVehicleId) {
  return apiFetch('DELETE', `/loadout/loaner/${loanerVehicleId}`)
}

export function useLoadoutCart() {
  return useAPI('/loadout/cart')
}

export async function addToLoadoutCart(items) {
  return postJSON('/loadout/cart', { items })
}

export async function updateLoadoutCartItem(cartId, body) {
  return putJSON(`/loadout/cart/${cartId}`, body)
}

export async function removeLoadoutCartItem(cartId) {
  return apiFetch('DELETE', `/loadout/cart/${cartId}`)
}

export async function emptyLoadoutCart() {
  return apiFetch('DELETE', '/loadout/cart')
}

export async function optimizeLoadoutCart() {
  return postJSON('/loadout/cart/optimize', {})
}

// --- Components Reference ---

export function useComponents(type) {
  return useAPI(type ? `/components/${type}` : null, { skip: !type })
}

// --- Missions ---

export function useMissionGivers() {
  return useAPI('/gamedata/mission-givers')
}

export function useFactionDetail(slug) {
  return useAPI(slug ? `/gamedata/faction/${slug}` : null)
}

export function useMissionDetail(key) {
  return useAPI(key ? `/gamedata/mission/${key}` : null)
}

// --- User Blueprints (Crafting Tracker) ---

export function useUserBlueprints() {
  return useAPI('/blueprints')
}

export async function saveUserBlueprint({ blueprintUuid, craftingBlueprintId, nickname, qualityConfig }) {
  // Prefer uuid (channel-stable); craftingBlueprintId is supported as a
  // legacy fallback. The route enforces that at least one is supplied.
  const body = { nickname, qualityConfig }
  if (blueprintUuid) body.blueprintUuid = blueprintUuid
  if (craftingBlueprintId != null) body.craftingBlueprintId = craftingBlueprintId
  return postJSON('/blueprints', body)
}

export async function updateUserBlueprint(id, { nickname, craftedQuantity, qualityConfig }) {
  return patchJSON(`/blueprints/${id}`, { nickname, craftedQuantity, qualityConfig })
}

export async function deleteUserBlueprint(id) {
  return apiFetch('DELETE', `/blueprints/${id}`)
}

/**
 * Toggle owned/wishlist state for a blueprint by uuid. Either or both of
 * `owned` and `wishlist` may be passed; missing flags are left unchanged.
 * Returns { ok, owned, wishlist } reflecting the new server state.
 */
export async function setBlueprintState({ blueprintUuid, owned, wishlist }) {
  return putJSON('/blueprints/state', { blueprintUuid, owned, wishlist })
}

// --- Blueprint builds (multi-config per BP, mig 0226) ---

/**
 * Create a new build under a blueprint. Implicitly marks the BP owned.
 * Returns { ok, id }.
 */
export async function createBlueprintBuild({ blueprintUuid, name, qualityConfig, notes }) {
  return postJSON(`/blueprints/${blueprintUuid}/builds`, { name, qualityConfig, notes })
}

/** Update fields on an existing build. */
export async function updateBlueprintBuild(id, { name, qualityConfig, craftedQuantity, notes }) {
  return patchJSON(`/blueprints/builds/${id}`, { name, qualityConfig, craftedQuantity, notes })
}

/** Delete a build by id. */
export async function deleteBlueprintBuild(id) {
  return apiFetch('DELETE', `/blueprints/builds/${id}`)
}
