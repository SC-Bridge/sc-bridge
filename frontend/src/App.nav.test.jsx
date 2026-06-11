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
    expect(labels).toEqual(['Reports', 'Core Financials', 'Finance'])
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
