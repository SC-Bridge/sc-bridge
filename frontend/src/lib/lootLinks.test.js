import { describe, it, expect } from 'vitest'
import { parseLootUuid } from './lootLinks'

describe('parseLootUuid', () => {
  it('extracts the uuid from a /loot/<uuid> href', () => {
    expect(parseLootUuid('/loot/f72ca643-b48c-4f6e-abb7-d5bc8eb261aa')).toBe('f72ca643-b48c-4f6e-abb7-d5bc8eb261aa')
  })

  it('extracts the uuid from a /loot/<uuid>/detail href', () => {
    expect(parseLootUuid('/loot/abc-123/detail')).toBe('abc-123')
  })

  it('returns null for non-loot or malformed hrefs', () => {
    expect(parseLootUuid('https://robertsspaceindustries.com')).toBeNull()
    expect(parseLootUuid('/ships/gladius')).toBeNull()
    expect(parseLootUuid('/loot')).toBeNull()
    expect(parseLootUuid('/loot/')).toBeNull()
    expect(parseLootUuid(undefined)).toBeNull()
  })
})
