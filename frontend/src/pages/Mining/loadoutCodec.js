/**
 * URL <-> Rock Calculator state codec.
 *
 * The calculator's full scenario is encoded into the query string so a link
 * reproduces it exactly (deep-linkable + shareable). Selections are stored by
 * id (lasers/modules/gadget) and by uuid/name (rock pick), then resolved back
 * against the live `/api/gamedata/mining` data on decode — so a stale link
 * whose ids drifted across a patch degrades gracefully (missing pieces just
 * drop out) instead of throwing.
 *
 * Param scheme:
 *   ship   — ship preset index
 *   l<i>   — laser id in slot i           (l0, l1, l2)
 *   m<i>-<j> — module id in laser i slot j (m0-0, m0-1)
 *   gadget — gadget id
 *   rock   — deposit_name of the picked rock
 *   el     — composition uuid (dominant-element drill-in)
 */

export function encodeLoadoutParams({ shipIndex, laserIds, moduleIds, gadget, pick }) {
  const p = { ship: String(shipIndex ?? 0) }
  for (const [slot, laser] of Object.entries(laserIds ?? {})) {
    if (laser?.id != null) p[`l${slot}`] = String(laser.id)
  }
  for (const [key, mod] of Object.entries(moduleIds ?? {})) {
    if (mod?.id != null) p[`m${key}`] = String(mod.id)
  }
  if (gadget?.id != null) p.gadget = String(gadget.id)
  if (pick?.depositName) p.rock = pick.depositName
  if (pick?.compositionUuid) p.el = pick.compositionUuid
  return p
}

export function decodeLoadoutParams(searchParams, data, shipCount = Infinity) {
  // Treat as "no loadout in URL" only when none of our keys are present.
  const hasAny = ['ship', 'gadget', 'rock', 'el'].some((k) => searchParams.has(k))
    || [...searchParams.keys()].some((k) => /^l\d+$/.test(k) || /^m\d+-\d+$/.test(k))
  if (!hasAny) return null

  const byId = (list, id) => (list ?? []).find((x) => String(x.id) === String(id)) ?? null

  let shipIndex = parseInt(searchParams.get('ship') ?? '0', 10)
  if (!Number.isFinite(shipIndex) || shipIndex < 0 || shipIndex >= shipCount) shipIndex = 0

  const laserIds = {}
  const moduleIds = {}
  for (const [k, v] of searchParams.entries()) {
    const lm = k.match(/^l(\d+)$/)
    if (lm) {
      const laser = byId(data?.lasers, v)
      if (laser) laserIds[Number(lm[1])] = laser
      continue
    }
    const mm = k.match(/^m(\d+-\d+)$/)
    if (mm) {
      const mod = byId(data?.modules, v)
      if (mod) moduleIds[mm[1]] = mod
    }
  }

  const gadget = searchParams.has('gadget') ? byId(data?.gadgets, searchParams.get('gadget')) : null

  const depositName = searchParams.get('rock') || null
  const compositionUuid = searchParams.get('el') || null

  return { shipIndex, laserIds, moduleIds, gadget, pick: { depositName, compositionUuid } }
}
