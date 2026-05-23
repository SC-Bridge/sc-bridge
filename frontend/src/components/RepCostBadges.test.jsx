/**
 * PART K K11: vitest for <RepCostBadges> + parseLegacyRepSummary.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RepCostBadges, parseLegacyRepSummary } from './RepCostBadges'

describe('parseLegacyRepSummary', () => {
  it('returns empty array for null/empty', () => {
    expect(parseLegacyRepSummary(null, 'fail')).toEqual([])
    expect(parseLegacyRepSummary('', 'fail')).toEqual([])
  })

  it('parses single entry', () => {
    expect(parseLegacyRepSummary('security: -XXS', 'fail')).toEqual([
      { scope_slug: 'security', event: 'fail', size_code: 'XXS', direction: 'negative', rep_amount: null },
    ])
  })

  it('parses multi-scope with comma separator', () => {
    const rows = parseLegacyRepSummary('security: -M, affinity: -S', 'abandon')
    expect(rows).toHaveLength(2)
    expect(rows[0].scope_slug).toBe('security')
    expect(rows[1].scope_slug).toBe('affinity')
    expect(rows.every(r => r.event === 'abandon')).toBe(true)
  })

  it('parses positive direction', () => {
    expect(parseLegacyRepSummary('security: +L', 'fail')[0].direction).toBe('positive')
  })
})

describe('RepCostBadges', () => {
  it('returns null when no changes and no summaries', () => {
    const { container } = render(<RepCostBadges changes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders structured changes grouped by event with resolved numbers + humanised scopes', () => {
    const changes = [
      { scope_slug: 'security', event: 'fail', size_code: 'M', direction: 'negative', rep_amount: -50 },
      { scope_slug: 'affinity', event: 'fail', size_code: 'S', direction: 'negative', rep_amount: -25 },
      { scope_slug: 'security', event: 'abandon', size_code: 'S', direction: 'negative', rep_amount: -10 },
    ]
    render(<RepCostBadges changes={changes} />)
    expect(screen.getByText('fail:')).toBeInTheDocument()
    expect(screen.getByText('abandon:')).toBeInTheDocument()
    // Numeric rep_amount with humanised scope + U+2212 minus
    expect(screen.getByText(/Security −50/)).toBeInTheDocument()
    expect(screen.getByText(/Affinity −25/)).toBeInTheDocument()
    expect(screen.getByText(/Security −10/)).toBeInTheDocument()
  })

  it('shows rep_amount + size code in the tooltip', () => {
    const changes = [
      { scope_slug: 'security', event: 'fail', size_code: 'M', direction: 'negative', rep_amount: -50 },
    ]
    render(<RepCostBadges changes={changes} />)
    expect(screen.getByTitle(/−50 rep/)).toBeInTheDocument()
  })

  it('falls back to the CIG size ladder when rep_amount is null', () => {
    // XXS → 250 via the fixed ladder
    const changes = [
      { scope_slug: 'security', event: 'fail', size_code: 'XXS', direction: 'negative', rep_amount: null },
    ]
    render(<RepCostBadges changes={changes} />)
    expect(screen.getByText(/Security −250/)).toBeInTheDocument()
  })

  it('falls back to parsing legacy summary strings when changes is empty (resolved via ladder)', () => {
    render(
      <RepCostBadges
        changes={[]}
        repFailSummary="security: -M"
        repAbandonSummary="security: -S, affinity: -XXS"
      />
    )
    expect(screen.getByText('fail:')).toBeInTheDocument()
    expect(screen.getByText('abandon:')).toBeInTheDocument()
    // M→2000, S→1000, XXS→250 via the ladder (legacy strings have no rep_amount)
    expect(screen.getByText(/Security −2,000/)).toBeInTheDocument()
    expect(screen.getByText(/Security −1,000/)).toBeInTheDocument()
    expect(screen.getByText(/Affinity −250/)).toBeInTheDocument()
  })

  it('prefers structured changes over legacy strings when both present', () => {
    render(
      <RepCostBadges
        changes={[
          { scope_slug: 'security', event: 'fail', size_code: 'L', direction: 'negative', rep_amount: -100 },
        ]}
        repFailSummary="should: -BE_IGNORED"
      />
    )
    expect(screen.getByText(/Security −100/)).toBeInTheDocument()
    expect(screen.queryByText(/should/)).toBeNull()
  })

  it('renders positive direction with green styling marker', () => {
    const changes = [
      { scope_slug: 'security', event: 'success', size_code: 'XS', direction: 'positive', rep_amount: 10 },
    ]
    render(<RepCostBadges changes={changes} />)
    const badge = screen.getByTitle(/Security: \+10 rep/)
    expect(badge.className).toMatch(/emerald/)
  })
})
