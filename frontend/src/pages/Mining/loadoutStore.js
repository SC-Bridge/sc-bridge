/**
 * Saved Rock Calculator loadouts.
 *
 * A loadout is the reusable *ship config* — ship preset + lasers + modules +
 * gadget — WITHOUT the rock (the rock is what you test against, not part of
 * the build). Stored as a compact id-only shape so it survives in localStorage
 * (anonymous users) or a user_settings JSON-array string (logged-in users).
 * Resolved back to live objects against `/api/gamedata/mining` data on load,
 * dropping ids that no longer exist after a patch.
 */

export const LOCAL_KEY = 'scbridge:mining:loadouts'
export const MAX_LOADOUTS = 20

/** Current calculator state -> compact, persistable entry (ids only, no rock). */
export function serializeLoadout(name, { shipIndex, laserIds, moduleIds, gadget }) {
  const laserIdMap = {}
  for (const [slot, laser] of Object.entries(laserIds ?? {})) {
    if (laser?.id != null) laserIdMap[slot] = laser.id
  }
  const moduleIdMap = {}
  for (const [key, mod] of Object.entries(moduleIds ?? {})) {
    if (mod?.id != null) moduleIdMap[key] = mod.id
  }
  return {
    name: String(name).trim(),
    ship: shipIndex ?? 0,
    laserIds: laserIdMap,
    moduleIds: moduleIdMap,
    gadget: gadget?.id ?? null,
  }
}

/** Saved entry -> live selections, resolving ids against current mining data. */
export function resolveLoadout(entry, data) {
  const byId = (list, id) => (list ?? []).find((x) => String(x.id) === String(id)) ?? null
  const laserIds = {}
  for (const [slot, id] of Object.entries(entry?.laserIds ?? {})) {
    const laser = byId(data?.lasers, id)
    if (laser) laserIds[slot] = laser
  }
  const moduleIds = {}
  for (const [key, id] of Object.entries(entry?.moduleIds ?? {})) {
    const mod = byId(data?.modules, id)
    if (mod) moduleIds[key] = mod
  }
  return {
    shipIndex: entry?.ship ?? 0,
    laserIds,
    moduleIds,
    gadget: entry?.gadget != null ? byId(data?.gadgets, entry.gadget) : null,
  }
}

/** Add or replace (by case-insensitive name); cap to MAX_LOADOUTS, oldest first. */
export function upsertLoadout(list, entry) {
  const lc = entry.name.toLowerCase()
  const without = (list ?? []).filter((l) => l.name.toLowerCase() !== lc)
  const next = [...without, entry]
  return next.length > MAX_LOADOUTS ? next.slice(next.length - MAX_LOADOUTS) : next
}

export function removeLoadout(list, name) {
  const lc = String(name).toLowerCase()
  return (list ?? []).filter((l) => l.name.toLowerCase() !== lc)
}

export function readLocalLoadouts() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function writeLocalLoadouts(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list ?? []))
  } catch {
    /* quota / disabled storage — non-fatal */
  }
}
