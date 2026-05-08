import { describe, it, expect } from 'vitest'
import { getNavItems } from './App'

describe('getNavItems — Accountant entry', () => {
  it('N1: logged-in user sees the Accountant entry at /accountant/settings', () => {
    const items = getNavItems('user', true, {})
    const flat = flattenItems(items)
    const entry = flat.find(item => item.to === '/accountant/settings')
    expect(entry).toBeDefined()
    expect(entry.label).toBe('Accountant')
  })

  it('N2: logged-out user does NOT see the Accountant entry', () => {
    const items = getNavItems(null, false, {})
    const flat = flattenItems(items)
    const entry = flat.find(item => item.to === '/accountant/settings')
    expect(entry).toBeUndefined()
  })

  it('N3: the Accountant entry has no submenu (top-level only in M0)', () => {
    const items = getNavItems('user', true, {})
    const flat = flattenItems(items)
    const entry = flat.find(item => item.to === '/accountant/settings')
    expect(entry).toBeDefined()
    expect(entry.submenu).toBeUndefined()
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
