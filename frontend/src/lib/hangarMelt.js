/**
 * What a hangar item is worth if you reclaim it — and what it costs you.
 *
 * Melting works on a whole pledge, never on one item. A standalone paint
 * pledge can be reclaimed on its own; the same paint bundled into a ship
 * package cannot, because reclaiming it takes the ship with it. Most players
 * asking "how much could I melt?" mean the first kind, so the two are counted
 * separately rather than added into one misleading number.
 *
 * Reclaiming returns the pledge's current value, so there is no separate melt
 * figure: melt value IS `pledge_value_cents` when the pledge is reclaimable.
 */

/** Kinds that mean "you would lose a ship". */
const SHIP_KINDS = new Set(['Ship'])

function pledgeKeyOf(item) {
  return item?.pledge_id != null ? String(item.pledge_id) : null
}

/** Index items by the pledge they belong to. */
function byPledge(items) {
  const map = new Map()
  for (const it of items ?? []) {
    const key = pledgeKeyOf(it)
    if (key === null) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  return map
}

/**
 * Whether a pledge belongs in a dollar total.
 *
 * UEC pledges are game credits, not money, and zero-value rows contribute
 * nothing. The dashboard and fleet totals already exclude both (see the
 * `currency NOT LIKE '%UEC%'` filter in the analysis query) — counting them
 * here would make the hangar's pledge counts disagree with its own money.
 */
function countsTowardMoney(item) {
  if (!item) return false
  if ((item.pledge_value_cents ?? 0) <= 0) return false
  return !String(item.pledge_currency ?? '').toUpperCase().includes('UEC')
}

/**
 * Melt state for one item, given the full hangar list.
 *
 *   `free`     — its pledge holds nothing else; reclaim it and lose only this
 *   `bundled`  — its pledge holds other items too; reclaiming takes them all
 *   `locked`   — the pledge cannot be reclaimed, or there is no pledge at all
 *
 * `costsAShip` marks the bundles a player almost certainly will not break.
 */
export function meltStateFor(item, items) {
  if (!item || item.pledge_is_reclaimable !== 1 || pledgeKeyOf(item) === null) {
    return { state: 'locked', siblings: 0, costsAShip: false, cents: null }
  }
  const group = byPledge(items).get(pledgeKeyOf(item)) ?? [item]
  const siblings = group.length - 1
  const costsAShip = group.some((o) => o !== item && SHIP_KINDS.has(o.kind))
  return {
    state: siblings > 0 ? 'bundled' : 'free',
    siblings,
    costsAShip,
    cents: item.pledge_value_cents ?? null,
  }
}

/**
 * Roll up meltable value across the hangar, counting every pledge once.
 *
 *   `meltCents`      — everything reclaimable
 *   `keepShipsCents` — reclaimable pledges containing no ship: what you can
 *                      raise with every ship still in your hangar
 *   `shipCostCents`  — reclaimable pledges that contain a ship
 *
 * keepShipsCents is the figure worth leading with. Players asking "how much
 * could I melt?" while eyeing a new pack mean "without giving up ships", and
 * the axis they care about is ships, not how many items share a pledge — a
 * pledge holding two paints is just as safe to reclaim as one holding a
 * single paint.
 */
export function hangarMeltSummary(items) {
  const groups = byPledge(items)
  let meltCents = 0
  let keepShipsCents = 0
  let shipCostCents = 0
  let meltablePledges = 0
  let lockedPledges = 0
  let countedPledges = 0

  for (const group of groups.values()) {
    const head = group[0]
    if (!countsTowardMoney(head)) continue
    countedPledges += 1
    const cents = head.pledge_value_cents ?? 0
    if (head.pledge_is_reclaimable !== 1) {
      lockedPledges += 1
      continue
    }
    meltablePledges += 1
    meltCents += cents
    if (group.some((o) => SHIP_KINDS.has(o.kind))) shipCostCents += cents
    else keepShipsCents += cents
  }

  return {
    meltCents,
    keepShipsCents,
    shipCostCents,
    pledges: countedPledges,
    meltablePledges,
    lockedPledges,
  }
}

/**
 * Melt state for every item at once, keyed by item id.
 *
 * `meltStateFor` reindexes the whole hangar on each call, which is fine once
 * but quadratic inside a render loop — a 650-pledge hangar would rebuild that
 * index for every row. Callers rendering a list should use this and look up.
 */
export function meltStatesFor(items) {
  const groups = byPledge(items)
  const out = new Map()
  for (const it of items ?? []) {
    const key = pledgeKeyOf(it)
    if (it?.pledge_is_reclaimable !== 1 || key === null) {
      out.set(it?.id, { state: 'locked', siblings: 0, costsAShip: false, cents: null })
      continue
    }
    const group = groups.get(key) ?? [it]
    const siblings = group.length - 1
    out.set(it.id, {
      state: siblings > 0 ? 'bundled' : 'free',
      siblings,
      costsAShip: group.some((o) => o !== it && SHIP_KINDS.has(o.kind)),
      cents: it.pledge_value_cents ?? null,
    })
  }
  return out
}
