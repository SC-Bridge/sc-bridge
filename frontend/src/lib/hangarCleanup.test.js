import { describe, it, expect } from 'vitest'
import {
  parseUpgradeName, insuranceOf, normaliseExport, makeCatalog, analyse,
  rebuyPrice, buildSteps, stepsAsText, displayName,
} from './hangarCleanup'

// ── Fixtures in the GET /api/hangar-cleanup shape ──────────────────────────

const ins = (months, lifetime = false) => ({ title: lifetime ? 'Lifetime Insurance' : `${months} Month Insurance`, kind: 'Insurance', manufacturer_name: null, custom_name: null, insurance_months: lifetime ? null : months, insurance_lifetime: lifetime })
const shipItem = (title) => ({ title, kind: 'Ship', manufacturer_name: 'Drake Interplanetary', custom_name: null, insurance_months: null, insurance_lifetime: false })
const ship = (name, extra = {}) => ({ vehicle_id: extra.vehicle_id ?? 1, slug: name.toLowerCase(), name, focus: 'Transporter', classification: 'Heavy Freight', pledge_price_cents: extra.pledge_price_cents ?? null, price_auec: null, insurance_label: null, insurance_months: null, insurance_lifetime: false, warbond: false })

function pledge(id, name, value, extra = {}) {
  return {
    rsi_pledge_id: id, name, value_cents: value, currency: 'Store Credit', date: '2026-01-01',
    is_reclaimable: true, is_giftable: false, is_upgraded: false, is_warbond: false,
    ccu_from: null, ccu_to: null, items: [], upgrades: [], ships: [], ...extra,
  }
}

function model(pledges, extra = {}) {
  return { source: 'synced', synced_at: '2026-11-07T19:30:00Z', store_credit_cents: 7795, pledges, buybacks: [], ...extra }
}

const ironclad = pledge(1, 'Standalone Ships - X1 BASELINE EDITION - LTI', 44500, {
  is_upgraded: true,
  items: [ins(null, true), shipItem('Ironclad')],
  upgrades: [ // RSI order: newest first
    { name: 'Upgrade applied: #2 Upgrade - Prowler to Ironclad Standard Edition, new value: $445.00 USD', applied_at: '2026-04-08', new_value_cents: 44500 },
    { name: 'Upgrade applied: #1 Upgrade - X1 to Prowler Standard Edition, new value: $435.00 USD', applied_at: '2026-04-08', new_value_cents: 43500 },
  ],
  ships: [ship('Drake Ironclad', { pledge_price_cents: 60000 })],
})
const pulseToken = pledge(2, 'Standalone Ships - Pulse plus Dominion Paint', 2500, { items: [ins(null, true), shipItem('Pulse')], ships: [ship('Mirai Pulse', { vehicle_id: 2, pledge_price_cents: 3000 })] })
const pioneer = pledge(3, 'Standalone Ship - Consolidated Outland Pioneer Warbond', 75000, { is_warbond: true, items: [ins(60), shipItem('Pioneer')], ships: [ship('C.O. Pioneer', { vehicle_id: 3, pledge_price_cents: 92500 })] })
const hullD = pledge(4, 'Standalone Ship - MISC Hull C - IAE 2949', 30500, { is_upgraded: true, items: [ins(120), shipItem('Hull D')], upgrades: [{ name: 'Upgrade - Hull C to Hull D, new value: $305.00 USD', applied_at: null, new_value_cents: 30500 }] })
const furyPaint = pledge(5, 'Paints - Fury - 7 Paint Pack', 2480, { items: [{ title: 'Fury - Black Star Paint', kind: 'Skin', manufacturer_name: null, custom_name: null, insurance_months: null, insurance_lifetime: false }] })
const ironcladPaint = pledge(6, 'Paints - Ironclad - Polar Paint', 1100, { items: [{ title: 'Ironclad - Polar Paint', kind: 'Skin', manufacturer_name: null, custom_name: null, insurance_months: null, insurance_lifetime: false }] })
const orphanCcu = pledge(7, 'Upgrade - 315p to CNOU Nomad Warbond Edition', 500, { is_warbond: true, ccu_from: '315p Explorer', ccu_to: 'Nomad' })
const orphanCcu2 = pledge(8, 'Upgrade - 315p to CNOU Nomad Warbond Edition', 500, { is_warbond: true, ccu_from: '315p Explorer', ccu_to: 'Nomad' })
const usableCcu = pledge(9, 'Upgrade - Pulse to Mustang Alpha', 500, { ccu_from: 'Pulse', ccu_to: 'Mustang Alpha' })
const gearA = pledge(10, 'Gear - Red Festival Armor', 1000, { items: [{ title: 'Calva Helmet', kind: 'FPS Equipment', manufacturer_name: null, custom_name: null, insurance_months: null, insurance_lifetime: false }] })
const gearB = pledge(11, 'Gear - Red Festival Armor', 1000, { items: gearA.items })
const goodies = pledge(12, 'Digital Goodies Pack - CitizenCon', 1500, { is_reclaimable: false })

const ALL = [ironclad, pulseToken, pioneer, hullD, furyPaint, ironcladPaint, orphanCcu, orphanCcu2, usableCcu, gearA, gearB, goodies]
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

// ── Parsing ─────────────────────────────────────────────────────────────────

describe('parseUpgradeName', () => {
  it('reads from/to out of an RSI upgrade-log line and drops the edition suffix', () => {
    expect(parseUpgradeName('Apr 08 2026, 7:58 pm\n  Upgrade applied: #104897053 Upgrade - Prowler to Ironclad Standard Edition, new value: $445.00 USD'))
      .toEqual({ from: 'Prowler', to: 'Ironclad' })
  })
  it('handles a Warbond edition and a bare name', () => {
    expect(parseUpgradeName('Upgrade - Hurricane to F7C-M Super Hornet Mk II  Warbond Edition')).toEqual({ from: 'Hurricane', to: 'F7C-M Super Hornet Mk II' })
  })
  it('returns null for text that is not an upgrade', () => {
    expect(parseUpgradeName('Gift sent')).toBeNull()
  })
})

describe('insuranceOf', () => {
  it('picks the best insurance across items (LTI beats 120 months)', () => {
    expect(insuranceOf({ items: [ins(120), ins(null, true)] })).toMatchObject({ tier: 'LTI', label: 'LTI' })
  })
  it('classes 60+ months as long and under 60 as short', () => {
    expect(insuranceOf({ items: [ins(60)] }).tier).toBe('long')
    expect(insuranceOf({ items: [ins(2)] }).tier).toBe('short')
    expect(insuranceOf({ items: [] }).tier).toBe('none')
  })
})

describe('normaliseExport', () => {
  const exportJson = {
    account: { nickname: 'Pilot', store_credit_cents: 779500 },
    export_meta: { exported_at: '2026-11-07T19:30:05Z' },
    upgrade_logs: [{ pledge_id: 1, name: 'Upgrade - X1 to Prowler, new value: $435.00 USD', new_value: 'Upgrade - X1 to Prowler, new value: $435.00 USD' }],
    buyback_pledges: [{ id: 99, name: 'Standalone Ships - Constellation Taurus', value_cents: 0 }],
    pledges: [{
      id: 1, name: 'Standalone Ships - X1 BASELINE EDITION - LTI', valueCents: 43500, currency: 'Store Credit', date: 'April 08, 2026',
      is_reclaimable: true, is_upgraded: true, is_warbond: false, insurance_type: 'LTI',
      items: [{ title: 'Lifetime Insurance', kind: 'Insurance' }, { title: 'Prowler', kind: 'Ship', manufacturer: 'Esperia' }],
    }, {
      id: 2, name: 'Upgrade - Hurricane to F7C-M', valueCents: 1000, is_reclaimable: true, is_warbond: true, items: [],
      upgradeData: { match_items: [{ id: 1, name: 'Hurricane' }], target_items: [{ id: 2, name: 'F7C-M Super Hornet Mk II' }, { id: 3, name: 'Lifetime Insurance' }] },
    }],
  }
  const catalog = makeCatalog([{ id: 50, slug: 'espr-prowler', name: 'Esperia Prowler', manufacturer_name: 'Esperia', focus: 'Combat', classification: 'Dropship', pledge_price: 435, price_auec: null }])
  const m = normaliseExport(exportJson, catalog)

  it('maps pledges to the synced shape', () => {
    expect(m.source).toBe('file')
    expect(m.pledges[0]).toMatchObject({ rsi_pledge_id: 1, value_cents: 43500, is_reclaimable: true, is_upgraded: true })
    expect(m.pledges[0].upgrades).toHaveLength(1)
    expect(insuranceOf(m.pledges[0]).tier).toBe('LTI')
  })
  it('resolves owned ships against the ship catalog', () => {
    expect(m.pledges[0].ships[0]).toMatchObject({ vehicle_id: 50, focus: 'Combat', pledge_price_cents: 43500 })
  })
  it('takes CCU from/to from upgradeData, ignoring insurance targets', () => {
    expect(m.pledges[1]).toMatchObject({ ccu_from: 'Hurricane', ccu_to: 'F7C-M Super Hornet Mk II', is_warbond: true })
  })
  it('divides store credit by 100 for exports made before extension 0.6.2', () => {
    expect(m.store_credit_cents).toBe(7795)
    expect(normaliseExport({ ...exportJson, export_meta: { extension_version: '0.6.2' }, account: { store_credit_cents: 7795 } }, catalog).store_credit_cents).toBe(7795)
  })
  it('rejects a file with no pledges list', () => {
    expect(() => normaliseExport({ hello: 1 }, catalog)).toThrow(/pledges/)
  })
})

// ── Analysis ────────────────────────────────────────────────────────────────

describe('analyse', () => {
  const rows = byId(analyse(model(ALL)).rows)

  it('works out the base hull from the oldest upgrade step', () => {
    expect(rows[1].base).toBe('X1')
    expect(rows[1].chain.map((c) => c.to)).toEqual(['Prowler', 'Ironclad'])
  })
  it('uses the pledge name for an upgraded ship with no log, and the hull itself when not upgraded', () => {
    expect(rows[4].base).toBe('Hull C')
    expect(rows[2].base).toBe('Pulse')
  })
  it('flags LTI tokens and LTI chains', () => {
    expect(rows[2].flags).toContain('lti-token')
    expect(rows[1].flags).toContain('lti-chain')
  })
  it('flags insurance that is not LTI', () => {
    expect(rows[3].flags).toContain('ins-long')
    expect(rows[3].suggestion.action).toBe('ins')
    expect(rows[3].suggestion.reasons.join(' ')).toMatch(/Pulse LTI token/)
  })
  it('flags paints for ships you do not own, but not for ones you do', () => {
    expect(rows[5].flags).toContain('paint-unowned')
    expect(rows[5].suggestion.action).toBe('melt')
    expect(rows[6].flags).not.toContain('paint-unowned')
  })
  it('flags CCUs whose from-ship you cannot reach, and duplicates of them', () => {
    expect(rows[7].flags).toEqual(expect.arrayContaining(['ccu-orphan', 'ccu-dupe']))
    expect(rows[9].flags).not.toContain('ccu-orphan')
    expect(rows[9].suggestion.action).toBe('keep')
  })
  it('reads CCU from/to out of the pledge name when the sync has not stored them yet', () => {
    const oldSync = pledge(30, 'Upgrade - Pulse to Mustang Alpha', 500)
    const r = byId(analyse(model([pulseToken, oldSync])).rows)
    expect(displayName(r[30])).toBe('Pulse → Mustang Alpha')
    expect(r[30].flags).not.toContain('ccu-orphan')
  })
  it('suggests melting the second copy of an identical item pledge', () => {
    expect(rows[10].suggestion.action).toBe('keep')
    expect(rows[11].suggestion.action).toBe('melt')
  })
  it('never suggests melting something that is not reclaimable', () => {
    expect(rows[12].flags).toContain('not-meltable')
    expect(rows[12].suggestion.label).toMatch(/Can't melt/)
  })
  it('names rows by ship, CCU path, or item', () => {
    expect(displayName(rows[1])).toBe('Ironclad')
    expect(displayName(rows[7])).toBe('315p Explorer → Nomad')
    expect(displayName(rows[5])).toBe('Fury - 7 Paint Pack')
  })
  it('flags two pledges of the same hull as duplicates and keeps the better-insured one', () => {
    const dupe = pledge(20, 'Standalone Ship - Pulse', 2500, { items: [ins(6), shipItem('Pulse')] })
    const r = byId(analyse(model([pulseToken, dupe])).rows)
    expect(r[20].flags).toContain('dupe-ship')
    expect(r[20].suggestion.action).toBe('melt')
    expect(r[2].suggestion.action).not.toBe('melt')
  })
})

describe('rebuyPrice', () => {
  const rows = byId(analyse(model(ALL)).rows)
  it('uses the price you entered, then the store price', () => {
    expect(rebuyPrice(rows[3], {})).toEqual({ cents: 92500, source: 'store' })
    expect(rebuyPrice(rows[3], { 3: { iae_price_cents: 90000 } })).toEqual({ cents: 90000, source: 'yours' })
    expect(rebuyPrice(rows[4], {}).cents).toBeNull()
  })
})

// ── Process plan ────────────────────────────────────────────────────────────

describe('buildSteps', () => {
  const rows = analyse(model(ALL)).rows
  const decisions = { 3: { decision: 'iae' }, 5: { decision: 'melt' }, 4: { decision: 'ins' }, 7: { decision: 'review' } }
  const buys = [{ vehicle_id: 77, name: 'Carrack', price_cents: 60000 }]
  const plan = buildSteps({ rows, decisions, buys, credit: 7795 })
  const phase = (k) => plan.phases.find((p) => p.key === k)

  it('melts first, largest value first, with a running credit balance', () => {
    const melt = phase('melt').steps
    expect(melt.map((s) => s.key)).toEqual(['melt-3', 'melt-5'])
    expect(melt[0].money.join(' ')).toMatch(/credit ≈ \$827\.95/)
  })
  it('shows where store credit runs out and a card payment starts', () => {
    const buy = phase('buy').steps
    expect(buy[0].money.join(' ')).toMatch(/\$852\.75 from credit \+ \$72\.25 by card/)
    expect(buy[1].money.join(' ')).toMatch(/\$600\.00 by card/)
    expect(phase('prep').steps[0].money.join(' ')).toMatch(/Card needed ~\$672\.25/)
  })
  it('lists insurance work and undecided reviews', () => {
    expect(phase('ins').steps[0].title).toMatch(/Hull D/)
    expect(phase('review').steps).toHaveLength(1)
  })
  it('is empty when nothing is decided', () => {
    expect(buildSteps({ rows, decisions: {}, buys: [], credit: 0 }).actionable).toBe(0)
  })
  it('renders a plain-text checklist with ticks', () => {
    const text = stepsAsText(plan, ['melt-3'])
    expect(text).toMatch(/\[x\] 2\. Exchange/)
    expect(text).toMatch(/\[ \] 3\. Exchange/)
  })
})
