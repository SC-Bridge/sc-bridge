import { describe, it, expect } from 'vitest'
import { getNavItems } from './App'

describe('getNavItems — Accountant entry', () => {
  it('N1: logged-in user sees the Accountant group without a Settings item (folded into site Settings)', () => {
    const items = getNavItems('user', true, {})
    const group = items.find(item => item.group === 'Accountant')
    expect(group).toBeDefined()
    const entry = group.items.find(item => item.to === '/accountant/settings')
    expect(entry).toBeUndefined()
  })

  it('N2: logged-out user does NOT see the Accountant group', () => {
    const items = getNavItems(null, false, {})
    const group = items.find(item => item.group === 'Accountant')
    expect(group).toBeUndefined()
  })
})

describe('Settings nav placement (owner decision 2026-06-12: bottom of menu)', () => {
  it('Settings is the LAST item for a regular logged-in user', () => {
    const items = getNavItems('user', true, {}, 'industrial')
    expect(items[items.length - 1].to).toBe('/settings')
  })

  it('admin entries append below Settings for admin roles', () => {
    const items = getNavItems('super_admin', true, {}, 'industrial')
    const labels = items.map((i) => i.label ?? i.group)
    const settingsIdx = labels.indexOf('Settings')
    expect(settingsIdx).toBeGreaterThan(labels.indexOf('Orgs'))
    expect(labels.indexOf('Admin')).toBeGreaterThan(settingsIdx)
    expect(labels.indexOf('Users')).toBeGreaterThan(settingsIdx)
  })
})

describe('Accountant nav group — tier gating', () => {
  const features = {}

  function accountantGroup(tier) {
    return getNavItems('user', true, features, tier).find((i) => i.group === 'Accountant')
  }

  it('renders the Accountant group with only Core Financials at easy tier (no Settings item, Reports gated to industrial)', () => {
    const group = accountantGroup('easy')
    expect(group).toBeTruthy()
    const labels = group.items.map((i) => i.label)
    expect(labels).toEqual(['Core Financials'])
  })

  it('defaults to easy when tier is undefined', () => {
    const group = accountantGroup(undefined)
    expect(group.items.map((i) => i.label)).toEqual(['Core Financials'])
  })

  it('tier-gated sub-group parents are fully absent, not greyed', () => {
    const rank = { easy: 0, advanced: 1, industrial: 2 }
    for (const tier of ['easy', 'advanced', 'industrial']) {
      const group = accountantGroup(tier)
      for (const item of group.items) {
        if (item.minTier) {
          expect(rank[item.minTier]).toBeLessThanOrEqual(rank[tier])
        }
      }
    }
  })
})

describe('Accountant nav — nested sub-groups (M3 nav pass, owner decision 2026-06-11)', () => {
  function accountantGroup(tier) {
    return getNavItems('user', true, {}, tier).find((i) => i.group === 'Accountant')
  }

  it('structures the group as Reports / Core Financials / Finance (no Settings item)', () => {
    const labels = accountantGroup('industrial').items.map((i) => i.label)
    expect(labels).toEqual(['Reports', 'Core Financials', 'Finance', 'Orders'])
  })

  it('Core Financials (all tiers) nests Ledger + Sorting List; sorting badge survives nesting', () => {
    const core = accountantGroup('easy').items.find((i) => i.label === 'Core Financials')
    expect(core.submenu.map((s) => s.to)).toEqual(['/accountant/ledger', '/accountant/sorting'])
    expect(core.submenu.find((s) => s.label === 'Sorting List').badge).toBe('sorting')
  })

  it('hides Finance and Reports sub-groups below industrial tier (fully absent, not greyed)', () => {
    const labels = accountantGroup('advanced').items.map((i) => i.label)
    expect(labels).not.toContain('Finance')
    expect(labels).not.toContain('Reports')
    expect(accountantGroup('easy').items.map((i) => i.label)).not.toContain('Finance')
    expect(accountantGroup('easy').items.map((i) => i.label)).not.toContain('Reports')
  })

  it('Finance nests Loans (loans badge survives nesting) + Tactical at UNCHANGED routes', () => {
    const fin = accountantGroup('industrial').items.find((i) => i.label === 'Finance')
    expect(fin.submenu.map((s) => s.to)).toEqual(['/accountant/loans', '/accountant/tactical'])
    expect(fin.submenu.find((s) => s.label === 'Loans').badge).toBe('loans')
  })

  it('Reports nests Overview + the four report pages at the M3 routes', () => {
    const rep = accountantGroup('industrial').items.find((i) => i.label === 'Reports')
    expect(rep.submenu.map((s) => s.to)).toEqual([
      '/accountant/reports',
      '/accountant/reports/pl',
      '/accountant/reports/balance',
      '/accountant/reports/net-worth',
      '/accountant/reports/cash-flow',
    ])
  })
})

describe('Accountant nav — M5 Orders sub-group (minTier advanced, after Finance)', () => {
  function accountantGroup(tier) {
    return getNavItems('user', true, {}, tier).find((i) => i.group === 'Accountant')
  }
  it('industrial tier sees Reports / Core Financials / Finance / Orders — Orders LAST', () => {
    expect(accountantGroup('industrial').items.map((i) => i.label))
      .toEqual(['Reports', 'Core Financials', 'Finance', 'Orders'])
  })
  it('advanced tier sees Orders but NOT Finance/Reports', () => {
    const labels = accountantGroup('advanced').items.map((i) => i.label)
    expect(labels).toEqual(['Core Financials', 'Orders'])
  })
  it('easy tier does NOT see Orders (fully absent, never greyed)', () => {
    expect(accountantGroup('easy').items.map((i) => i.label)).toEqual(['Core Financials'])
  })
  it('Orders nests Market + Workorders at the B.5 routes and carries the orders badge', () => {
    const orders = accountantGroup('advanced').items.find((i) => i.label === 'Orders')
    expect(orders.submenu.map((s) => s.to)).toEqual(['/accountant/orders/market', '/accountant/orders/workorders'])
    expect(orders.badge).toBe('orders')
    expect(orders.minTier).toBe('advanced')
  })
})

/**
 * Recursively flatten nav items and group children into a single array.
 * Handles both flat items ({ to, label, icon }) and group objects ({ group, items }).
 */
function flattenItems(items) {
  const result = []
  for (const item of items) {
    if (item.items) {
      // Group — recurse into items
      result.push(...flattenItems(item.items))
    } else {
      result.push(item)
    }
  }
  return result
}
