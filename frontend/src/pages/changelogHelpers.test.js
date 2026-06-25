import { describe, it, expect } from 'vitest'
import { groupChangelogByDate, categoryMeta } from './changelogHelpers'

describe('groupChangelogByDate', () => {
  const entries = [
    { id: 3, entry_date: '2026-06-06', title: 'C', category: 'feature', version: null },
    { id: 2, entry_date: '2026-06-06', title: 'B', category: 'fix', version: '1.2.0' },
    { id: 1, entry_date: '2026-06-05', title: 'A', category: 'improvement', version: null },
  ]

  it('groups consecutive entries by date preserving order', () => {
    const groups = groupChangelogByDate(entries)
    expect(groups.map((g) => g.date)).toEqual(['2026-06-06', '2026-06-05'])
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[1].entries).toHaveLength(1)
  })

  it('surfaces the first non-empty version for a date', () => {
    const groups = groupChangelogByDate(entries)
    expect(groups[0].version).toBe('1.2.0')
    expect(groups[1].version).toBeNull()
  })

  it('tolerates empty / null input', () => {
    expect(groupChangelogByDate([])).toEqual([])
    expect(groupChangelogByDate(null)).toEqual([])
  })
})

describe('categoryMeta', () => {
  it('maps known categories', () => {
    expect(categoryMeta('feature').label).toBe('New')
    expect(categoryMeta('fix').label).toBe('Fixed')
    expect(categoryMeta('improvement').label).toBe('Improved')
  })
  it('falls back for unknown categories', () => {
    expect(categoryMeta('weird').label).toBe('weird')
    expect(categoryMeta(undefined).label).toBe('Change')
  })
})
