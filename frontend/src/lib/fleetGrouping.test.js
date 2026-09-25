import { describe, it, expect } from 'vitest'
import { groupFleetByPledge, fleetValueTotals } from './fleetGrouping'

/** Minimal fleet row — only the fields grouping cares about. */
const ship = (over = {}) => ({
  id: over.id ?? 1,
  vehicle_name: over.vehicle_name ?? 'Aurora MR',
  pledge_id: 'pledge_id' in over ? over.pledge_id : '101',
  pledge_name: 'pledge_name' in over ? over.pledge_name : 'Standalone Ships - Aurora MR',
  current_value_cents: 'current_value_cents' in over ? over.current_value_cents : 5500,
  pledge_is_reclaimable: 'pledge_is_reclaimable' in over ? over.pledge_is_reclaimable : 1,
  source: over.source ?? 'pledge',
  is_derived_loaner: over.is_derived_loaner ?? false,
})

describe('groupFleetByPledge', () => {
  it('puts one ship in one group', () => {
    const groups = groupFleetByPledge([ship()])
    expect(groups).toHaveLength(1)
    expect(groups[0].ships).toHaveLength(1)
    expect(groups[0].meltable).toBe(true)
    expect(groups[0].cents).toBe(5500)
  })

  it('collects ships sharing a pledge into one group', () => {
    // The real case: "Add-Ons - G12 Triple Threat" holds 3 ships for one $155 pledge.
    const groups = groupFleetByPledge([
      ship({ id: 1, vehicle_name: 'G12', pledge_id: '900', pledge_name: 'G12 Triple Threat', current_value_cents: 15500 }),
      ship({ id: 2, vehicle_name: 'G12a', pledge_id: '900', pledge_name: 'G12 Triple Threat', current_value_cents: 15500 }),
      ship({ id: 3, vehicle_name: 'G12r', pledge_id: '900', pledge_name: 'G12 Triple Threat', current_value_cents: 15500 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].ships.map((s) => s.vehicle_name)).toEqual(['G12', 'G12a', 'G12r'])
    expect(groups[0].cents).toBe(15500)
  })

  it('marks a non-reclaimable pledge as not meltable but keeps its value', () => {
    const groups = groupFleetByPledge([ship({ pledge_is_reclaimable: 0 })])
    expect(groups[0].meltable).toBe(false)
    expect(groups[0].cents).toBe(5500)
  })

  it('buckets in-game purchases separately and never meltable', () => {
    const groups = groupFleetByPledge([
      ship({ id: 9, vehicle_name: 'Avenger Titan', source: 'ingame', pledge_id: null, pledge_name: null, current_value_cents: null, pledge_is_reclaimable: null }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('ingame')
    expect(groups[0].meltable).toBe(false)
    expect(groups[0].cents).toBe(null)
  })

  it('buckets derived loaners separately and never meltable', () => {
    const groups = groupFleetByPledge([
      ship({ id: 7, vehicle_name: 'Cutlass Black', is_derived_loaner: true, pledge_id: null, current_value_cents: null, pledge_is_reclaimable: null }),
    ])
    expect(groups[0].kind).toBe('loaner')
    expect(groups[0].meltable).toBe(false)
  })

  it('buckets pledged-but-unlinked ships (promos like the Saber Raven) as not meltable', () => {
    // Has a pledge name but no pledge row behind it → is_reclaimable is null.
    const groups = groupFleetByPledge([
      ship({ id: 5, vehicle_name: 'Saber Raven', pledge_id: null, pledge_name: 'Promotional', current_value_cents: null, pledge_is_reclaimable: null }),
    ])
    expect(groups[0].kind).toBe('unpledged')
    expect(groups[0].meltable).toBe(false)
  })

  it('sorts multi-ship groups before singles, then by value descending', () => {
    const groups = groupFleetByPledge([
      ship({ id: 1, pledge_id: '1', current_value_cents: 2000 }),
      ship({ id: 2, pledge_id: '2', current_value_cents: 9000 }),
      ship({ id: 3, pledge_id: '3', current_value_cents: 100 }),
      ship({ id: 4, pledge_id: '3', current_value_cents: 100 }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['3', '2', '1'])
  })

  it('keeps the non-meltable buckets last regardless of value', () => {
    const groups = groupFleetByPledge([
      ship({ id: 9, source: 'ingame', pledge_id: null, current_value_cents: null, pledge_is_reclaimable: null }),
      ship({ id: 1, pledge_id: '1', current_value_cents: 100 }),
    ])
    expect(groups[groups.length - 1].kind).toBe('ingame')
  })

  it('handles an empty or malformed fleet', () => {
    expect(groupFleetByPledge([])).toEqual([])
    expect(groupFleetByPledge(null)).toEqual([])
    expect(groupFleetByPledge(undefined)).toEqual([])
  })
})

describe('fleetValueTotals', () => {
  it('counts a multi-ship pledge ONCE, not once per ship', () => {
    // The bug this guards: summing per row bills the G12's $155 three times.
    const groups = groupFleetByPledge([
      ship({ id: 1, pledge_id: '900', current_value_cents: 15500 }),
      ship({ id: 2, pledge_id: '900', current_value_cents: 15500 }),
      ship({ id: 3, pledge_id: '900', current_value_cents: 15500 }),
    ])
    expect(fleetValueTotals(groups)).toEqual({ pledgeCents: 15500, meltCents: 15500 })
  })

  it('excludes non-meltable pledges from the melt total only', () => {
    const groups = groupFleetByPledge([
      ship({ id: 1, pledge_id: '1', current_value_cents: 10000, pledge_is_reclaimable: 1 }),
      ship({ id: 2, pledge_id: '2', current_value_cents: 4000, pledge_is_reclaimable: 0 }),
    ])
    expect(fleetValueTotals(groups)).toEqual({ pledgeCents: 14000, meltCents: 10000 })
  })

  it('ignores buckets with no value', () => {
    const groups = groupFleetByPledge([
      ship({ id: 1, pledge_id: '1', current_value_cents: 10000 }),
      ship({ id: 9, source: 'ingame', pledge_id: null, current_value_cents: null, pledge_is_reclaimable: null }),
    ])
    expect(fleetValueTotals(groups)).toEqual({ pledgeCents: 10000, meltCents: 10000 })
  })

  it('returns zeroes for an empty fleet', () => {
    expect(fleetValueTotals([])).toEqual({ pledgeCents: 0, meltCents: 0 })
  })
})
