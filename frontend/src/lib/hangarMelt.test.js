import { describe, it, expect } from 'vitest'
import { meltStateFor, meltStatesFor, hangarMeltSummary } from './hangarMelt'

/** Minimal hangar item — only the fields melt logic reads. */
const item = (over = {}) => ({
  id: over.id ?? 1,
  title: over.title ?? 'Sand Wave Paint',
  kind: 'kind' in over ? over.kind : 'Skin',
  pledge_id: 'pledge_id' in over ? over.pledge_id : 10,
  pledge_value_cents: 'pledge_value_cents' in over ? over.pledge_value_cents : 750,
  pledge_is_reclaimable: 'pledge_is_reclaimable' in over ? over.pledge_is_reclaimable : 1,
  pledge_currency: 'pledge_currency' in over ? over.pledge_currency : 'Store Credit',
})

describe('meltStateFor', () => {
  it('calls a lone item in its own pledge freely meltable', () => {
    const items = [item()]
    expect(meltStateFor(items[0], items).state).toBe('free')
  })

  it('calls a reclaimable pledge with several items bundled', () => {
    // Melting this paint would take the ship sharing its pledge.
    const items = [
      item({ id: 1, title: 'Carrack', kind: 'Ship' }),
      item({ id: 2, title: 'Carrack Paint', kind: 'Skin' }),
    ]
    const st = meltStateFor(items[1], items)
    expect(st.state).toBe('bundled')
    expect(st.siblings).toBe(1)
    expect(st.costsAShip).toBe(true)
  })

  it('bundles without a ship are still bundled, but cost no ship', () => {
    const items = [
      item({ id: 1, title: 'Armour', kind: 'FPS Equipment' }),
      item({ id: 2, title: 'Helmet', kind: 'FPS Equipment' }),
    ]
    const st = meltStateFor(items[0], items)
    expect(st.state).toBe('bundled')
    expect(st.costsAShip).toBe(false)
  })

  it('calls a non-reclaimable pledge locked', () => {
    const items = [item({ pledge_is_reclaimable: 0 })]
    expect(meltStateFor(items[0], items).state).toBe('locked')
  })

  it('treats an item with no pledge behind it as locked', () => {
    const items = [item({ pledge_id: null, pledge_is_reclaimable: null, pledge_value_cents: null })]
    expect(meltStateFor(items[0], items).state).toBe('locked')
  })
})

describe('hangarMeltSummary', () => {
  it('counts each pledge once, not once per item', () => {
    // Three items on one $220 pledge must contribute $220, not $660.
    const items = [
      item({ id: 1, pledge_id: 5, pledge_value_cents: 22000, kind: 'Ship' }),
      item({ id: 2, pledge_id: 5, pledge_value_cents: 22000, kind: 'Insurance' }),
      item({ id: 3, pledge_id: 5, pledge_value_cents: 22000, kind: 'Skin' }),
    ]
    expect(hangarMeltSummary(items).meltCents).toBe(22000)
  })

  it('separates what can be melted without losing a ship', () => {
    // This is Xul's actual question: how much can I raise by giving up
    // paints and gear, while keeping every ship?
    const items = [
      item({ id: 1, pledge_id: 1, pledge_value_cents: 22000, kind: 'Ship' }),
      item({ id: 2, pledge_id: 1, pledge_value_cents: 22000, kind: 'Skin' }),
      item({ id: 3, pledge_id: 2, pledge_value_cents: 750, kind: 'Skin' }),
      item({ id: 4, pledge_id: 3, pledge_value_cents: 500, kind: 'FPS Equipment' }),
    ]
    const s = hangarMeltSummary(items)
    expect(s.meltCents).toBe(23250)
    expect(s.keepShipsCents).toBe(1250)
    expect(s.shipCostCents).toBe(22000)
  })

  it('counts a shipless multi-item pledge as safe to melt', () => {
    // Two paints on one pledge is just as safe to reclaim as one paint —
    // the axis is ships, not how many items share the pledge.
    const items = [
      item({ id: 1, pledge_id: 4, pledge_value_cents: 1500, kind: 'Skin' }),
      item({ id: 2, pledge_id: 4, pledge_value_cents: 1500, kind: 'Skin' }),
    ]
    expect(hangarMeltSummary(items).keepShipsCents).toBe(1500)
  })

  it('excludes locked pledges from every total', () => {
    const items = [
      item({ id: 1, pledge_id: 1, pledge_value_cents: 750, pledge_is_reclaimable: 0 }),
      item({ id: 2, pledge_id: 2, pledge_value_cents: 500, pledge_is_reclaimable: 1 }),
    ]
    const s = hangarMeltSummary(items)
    expect(s.meltCents).toBe(500)
    expect(s.keepShipsCents).toBe(500)
    expect(s.lockedPledges).toBe(1)
  })

  it('handles empty and malformed input', () => {
    const empty = { meltCents: 0, keepShipsCents: 0, shipCostCents: 0, pledges: 0, meltablePledges: 0, lockedPledges: 0 }
    expect(hangarMeltSummary([])).toEqual(empty)
    expect(hangarMeltSummary(null)).toEqual(empty)
  })
})

describe('meltStatesFor', () => {
  it('agrees with meltStateFor for every item', () => {
    const items = [
      item({ id: 1, pledge_id: 1, kind: 'Ship' }),
      item({ id: 2, pledge_id: 1, kind: 'Skin' }),
      item({ id: 3, pledge_id: 2, kind: 'Skin' }),
      item({ id: 4, pledge_id: 3, pledge_is_reclaimable: 0 }),
    ]
    const batch = meltStatesFor(items)
    for (const it of items) {
      expect(batch.get(it.id)).toEqual(meltStateFor(it, items))
    }
  })

  it('handles empty input', () => {
    expect(meltStatesFor([]).size).toBe(0)
  })
})

describe('hangarMeltSummary currency and value filters', () => {
  it('ignores UEC pledges, which are game credits not dollars', () => {
    // The dashboard and fleet totals already exclude these. If the hangar
    // counted them the pledge counts would disagree with the money.
    const items = [
      item({ id: 1, pledge_id: 1, pledge_value_cents: 500, pledge_currency: 'Store Credit' }),
      item({ id: 2, pledge_id: 2, pledge_value_cents: 999999, pledge_currency: 'UEC' }),
    ]
    const s = hangarMeltSummary(items)
    expect(s.meltCents).toBe(500)
    expect(s.pledges).toBe(1)
    expect(s.meltablePledges).toBe(1)
  })

  it('ignores zero-value pledges', () => {
    const items = [
      item({ id: 1, pledge_id: 1, pledge_value_cents: 500 }),
      item({ id: 2, pledge_id: 2, pledge_value_cents: 0 }),
    ]
    expect(hangarMeltSummary(items).pledges).toBe(1)
  })
})
