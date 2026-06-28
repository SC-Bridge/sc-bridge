import { describe, it, expect } from 'vitest'
import { encodeBuild, decodeBuild } from './weaponBenchUrl'

describe('weaponBenchUrl', () => {
  it('round-trips a build', () => {
    const build = { weapon: 'gmni_pistol_ballistic_01', qualities: { 0: 750, 1: 600, 2: 820 }, attachments: { barrel: 'uuid-stark' } }
    expect(decodeBuild(encodeBuild(build))).toEqual(build)
  })
  it('tolerates malformed input', () => {
    expect(decodeBuild('not json')).toEqual({ weapon: null, qualities: {}, attachments: {} })
    expect(decodeBuild('')).toEqual({ weapon: null, qualities: {}, attachments: {} })
  })
})
