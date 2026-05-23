import { describe, it, expect } from 'vitest'
import { sentenceCaseTitle, humanizeStandingSlug, deriveRepScopeSlugs, humanizeMissionGiverSlug } from './missionConstants'

describe('sentenceCaseTitle', () => {
  it('capitalises the first letter of an all-lowercase title', () => {
    expect(sentenceCaseTitle('get the goods')).toBe('Get the goods')
    expect(sentenceCaseTitle('inventory clear out')).toBe('Inventory clear out')
    expect(sentenceCaseTitle('out of stock')).toBe('Out of stock')
    expect(sentenceCaseTitle('breach and steal')).toBe('Breach and steal')
  })

  it('leaves already-capitalised titles untouched', () => {
    expect(sentenceCaseTitle('Advanced Tracker License Certification')).toBe('Advanced Tracker License Certification')
    expect(sentenceCaseTitle('Destroy Deadly Contraband')).toBe('Destroy Deadly Contraband')
    expect(sentenceCaseTitle('Group Warrant Issued')).toBe('Group Warrant Issued')
  })

  it('does not touch template-tagged titles', () => {
    expect(sentenceCaseTitle('wildlife control: <var name="Creature"/>')).toBe('wildlife control: <var name="Creature"/>')
    // Has an uppercase C in the tag → treated as already-cased, left verbatim
    expect(sentenceCaseTitle('<var name="Title"/>')).toBe('<var name="Title"/>')
  })

  it('does not touch curly-placeholder titles', () => {
    expect(sentenceCaseTitle('haul to {location}')).toBe('haul to {location}')
  })

  it('handles null / empty / non-string defensively', () => {
    expect(sentenceCaseTitle(null)).toBe(null)
    expect(sentenceCaseTitle('')).toBe('')
    expect(sentenceCaseTitle(undefined)).toBe(undefined)
    expect(sentenceCaseTitle(42)).toBe(42)
  })

  it('handles leading whitespace', () => {
    expect(sentenceCaseTitle('  pick up the package')).toBe('  Pick up the package')
  })

  it('leaves a title starting with a digit unchanged', () => {
    expect(sentenceCaseTitle('2949 cargo run')).toBe('2949 cargo run')
  })
})

describe('humanizeStandingSlug', () => {
  // 4.8 regression: affinity slugs gained a `reputationstanding_` prefix, which
  // broke the `^affinity_` anchored regex → 52 rows rendered the raw last
  // segment ("-005"). The humaniser must tolerate the prefix.
  it('resolves prefixed affinity slugs (4.8 shape) to a relationship word', () => {
    expect(humanizeStandingSlug('reputationstanding_affinity_enemy_-005')).toBe('Not Hostile')
    expect(humanizeStandingSlug('reputationstanding_affinity_enemy_-015')).toBe('Not Hostile')
    expect(humanizeStandingSlug('reputationstanding_affinity_friend_005')).toBe('Friendly')
    expect(humanizeStandingSlug('reputationstanding_affinity_neutral')).toBe('Neutral')
  })

  it('still resolves bare affinity slugs (pre-4.8 shape)', () => {
    expect(humanizeStandingSlug('affinity_enemy_-005')).toBe('Not Hostile')
    expect(humanizeStandingSlug('affinity_friend')).toBe('Friendly')
  })

  it('never returns the raw "-005" segment for an affinity slug', () => {
    expect(humanizeStandingSlug('reputationstanding_affinity_enemy_-005')).not.toMatch(/-?\d/)
  })

  it('still resolves known rank/standing names and rank slugs', () => {
    expect(humanizeStandingSlug('bounty_applicant')).toBe('Applicant')
    expect(humanizeStandingSlug('security_rank4')).toBe('Rank 4')
    expect(humanizeStandingSlug('outsider')).toBe('Outsider')
  })

  it('skips NPC reliability slugs', () => {
    expect(humanizeStandingSlug('npc_fired_fired')).toBe(null)
  })
})

describe('deriveRepScopeSlugs', () => {
  it('prefers structured rep_changes rows', () => {
    const changes = [
      { scope_slug: 'affinity', event: 'fail' },
      { scope_slug: 'security', event: 'fail' },
      { scope_slug: 'affinity', event: 'abandon' },
    ]
    expect(deriveRepScopeSlugs(changes, 'should: -BE_IGNORED', null).sort()).toEqual(['affinity', 'security'])
  })

  it('falls back to parsing legacy fail/abandon strings', () => {
    expect(deriveRepScopeSlugs(null, 'affinity: -XXXXS, security: -M', 'courier: -S').sort())
      .toEqual(['affinity', 'courier', 'security'])
  })

  it('excludes the internal npc_reliability scope', () => {
    const changes = [
      { scope_slug: 'npc_reliability', event: 'fail' },
      { scope_slug: 'bounty', event: 'fail' },
    ]
    expect(deriveRepScopeSlugs(changes, null, null)).toEqual(['bounty'])
  })

  it('dedupes and lowercases', () => {
    expect(deriveRepScopeSlugs([{ scope_slug: 'Assassination' }, { scope_slug: 'ASSASSINATION' }], null, null))
      .toEqual(['assassination'])
  })

  it('returns [] for a mission with no rep scope data', () => {
    expect(deriveRepScopeSlugs(null, null, null)).toEqual([])
    expect(deriveRepScopeSlugs([], '', '')).toEqual([])
  })
})

describe('humanizeMissionGiverSlug', () => {
  it('word-splits concatenated bounty departments with correct casing', () => {
    expect(humanizeMissionGiverSlug('microtechbountydepartment')).toBe('microTech Bounty Department')
    expect(humanizeMissionGiverSlug('crusaderbountydepartment')).toBe('Crusader Bounty Department')
    expect(humanizeMissionGiverSlug('hurstonbountydepartment')).toBe('Hurston Bounty Department')
    expect(humanizeMissionGiverSlug('blacjacbountydepartment')).toBe('BlacJac Bounty Department')
  })

  it('resolves named individual givers', () => {
    expect(humanizeMissionGiverSlug('mileseckhart')).toBe('Miles Eckhart')
    expect(humanizeMissionGiverSlug('wallaceklim')).toBe('Wallace Klim')
    expect(humanizeMissionGiverSlug('teciapacheco')).toBe('Tecia Pacheco')
    expect(humanizeMissionGiverSlug('reccobattaglia')).toBe('Recco Battaglia')
  })

  it('strips the missiongiver_ prefix before lookup', () => {
    expect(humanizeMissionGiverSlug('missiongiver_covalexindependentcontractors')).toBe('Covalex Independent Contractors')
    expect(humanizeMissionGiverSlug('missiongiver_lingfamilyhauling')).toBe('Ling Family Hauling')
  })

  it('handles the bountyhunterguild (no-s) variant', () => {
    expect(humanizeMissionGiverSlug('bountyhunterguild')).toBe('Bounty Hunters Guild')
  })

  it('capitalises simple single-word givers via fallback', () => {
    expect(humanizeMissionGiverSlug('ruto')).toBe('Ruto')
    expect(humanizeMissionGiverSlug('vaughn')).toBe('Vaughn')
  })

  it('returns null for empty / placeholder', () => {
    expect(humanizeMissionGiverSlug(null)).toBe(null)
    expect(humanizeMissionGiverSlug('sender not found')).toBe(null)
  })
})
