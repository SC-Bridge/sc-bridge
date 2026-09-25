/**
 * Group fleet rows by the pledge that bought them.
 *
 * The fleet page lists ships, but melting works on *pledges*. A pledge can hold
 * several ships (Xul's "G12 Triple Threat" holds three for one $155 pledge), so
 * value belongs to the group, never to the row — summing per ship would bill
 * that $155 three times.
 *
 * Melt value is not a separate number: reclaiming a pledge returns its current
 * value, so melt IS `current_value_cents` whenever `pledge_is_reclaimable` is 1.
 * Everything else is simply not meltable.
 *
 * Ships with no pledge row behind them (bought in game, promotional codes like
 * the Saber Raven, derived loaners) get their own buckets. They have no value
 * and can never be melted — in-game ships can't even be sold yet.
 */

/** Ships that came from somewhere other than a pledge, in display order. */
const BUCKETS = {
  ingame: 'Bought in game',
  loaner: 'Loaners',
  unpledged: 'Not pledged',
}
const BUCKET_ORDER = ['ingame', 'loaner', 'unpledged']

function bucketFor(row) {
  if (row.is_derived_loaner) return 'loaner'
  if (row.source === 'ingame') return 'ingame'
  return 'unpledged'
}

/**
 * Build the grouped view of a fleet.
 *
 * Returns groups of `{ key, kind, pledgeName, cents, meltable, ships }`:
 *   - `kind: 'pledge'` — a real pledge; `cents` is its value, `meltable` says
 *     whether reclaiming it is possible.
 *   - `kind: 'ingame' | 'loaner' | 'unpledged'` — one catch-all bucket each,
 *     `cents: null`, never meltable.
 *
 * Multi-ship groups sort first (they're the ones that need a header row),
 * then by value descending. The valueless buckets always sort last.
 */
export function groupFleetByPledge(fleet) {
  if (!Array.isArray(fleet)) return []

  const pledges = new Map()
  const buckets = new Map()

  for (const row of fleet) {
    if (!row) continue
    const pledgeId = row.pledge_id != null && row.pledge_id !== '' ? String(row.pledge_id) : null
    // A pledge id alone isn't enough — promos and unmatched imports carry a
    // pledge name with no pledge row, so is_reclaimable comes back null.
    const linked = pledgeId !== null && row.pledge_is_reclaimable != null

    if (linked) {
      let g = pledges.get(pledgeId)
      if (!g) {
        g = {
          key: pledgeId,
          kind: 'pledge',
          pledgeName: row.pledge_name || 'Unnamed pledge',
          cents: row.current_value_cents ?? null,
          meltable: row.pledge_is_reclaimable === 1,
          ships: [],
        }
        pledges.set(pledgeId, g)
      }
      g.ships.push(row)
    } else {
      const kind = bucketFor(row)
      let b = buckets.get(kind)
      if (!b) {
        b = { key: kind, kind, pledgeName: BUCKETS[kind], cents: null, meltable: false, ships: [] }
        buckets.set(kind, b)
      }
      b.ships.push(row)
    }
  }

  const grouped = [...pledges.values()].sort((a, b) => {
    const multi = (b.ships.length > 1) - (a.ships.length > 1)
    if (multi !== 0) return multi
    return (b.cents ?? 0) - (a.cents ?? 0)
  })

  const tail = BUCKET_ORDER.filter((k) => buckets.has(k)).map((k) => buckets.get(k))
  return [...grouped, ...tail]
}

/**
 * Sum pledge and melt value across groups, in cents.
 *
 * Counts each group once — that's the whole reason grouping happens before
 * totalling. Valueless buckets contribute nothing.
 */
export function fleetValueTotals(groups) {
  let pledgeCents = 0
  let meltCents = 0
  for (const g of groups ?? []) {
    if (g?.cents == null) continue
    pledgeCents += g.cents
    if (g.meltable) meltCents += g.cents
  }
  return { pledgeCents, meltCents }
}
