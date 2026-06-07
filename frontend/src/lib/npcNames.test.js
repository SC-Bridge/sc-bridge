import { describe, it, expect } from 'vitest'
import { formatActorName } from './npcNames'

describe('formatActorName — SLoadoutAssortment prefix', () => {
  it('strips the SLoadoutAssortment. namespace prefix', () => {
    const out = formatActorName('SLoadoutAssortment.Criminal_Guard_Pyro_Heavy_Juggernaut')
    expect(out).not.toMatch(/sloadout/i)
    expect(out).not.toContain('.')
    expect(out).toMatch(/Criminal/)
    expect(out).toMatch(/Juggernaut/)
  })

  it('handles a plain loadout name without the prefix unchanged in spirit', () => {
    const out = formatActorName('Dusters_Grunt_Light_01')
    expect(out).not.toMatch(/sloadout/i)
    expect(out).toMatch(/Dusters/)
  })

  it('returns null for empty input', () => {
    expect(formatActorName(null)).toBeNull()
    expect(formatActorName('')).toBeNull()
  })

  it('still strips EntityClassDefinition prefix', () => {
    const out = formatActorName('EntityClassDefinition.PU_Human-Populace-Engineer-Male-StormBreaker_01')
    expect(out).not.toMatch(/entityclass/i)
    expect(out).not.toMatch(/populace/i)
  })
})
