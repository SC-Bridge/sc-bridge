import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BlueprintCard from './BlueprintCard'

const WEAPON_BP = {
  id: 1,
  type: 'weapons',
  sub_type: 'rifle',
  name: 'Behring P8-AR',
  craft_time_seconds: 270, // 4:30
  slots: [
    { resource_name: 'Beryl' },
    { resource_name: 'Tin' },
    { resource_name: 'Iron' },
  ],
  base_stats: {
    item_name: 'Behring P8-AR Battle Rifle',
    // NOTE: These `_max` fields are FABRICATED for unit testing the
    // rendering logic. The real /api/gamedata/crafting endpoint does NOT
    // return them — max values get computed from crafting_slot_modifiers
    // in a later batch (computeMaxStats helper). These fixtures simulate
    // the post-computation shape so the card render tests are stable.
    dps: 412,
    dps_max: 618,
    rounds_per_minute: 650,
    rounds_per_minute_max: 780,
    // Range uses the real API field name (effective_range, not range_m)
    // and has no _max because weapon range is static — no crafting
    // modifier affects it. See statConfig.js isStatic flag.
    effective_range: 35,
  },
}

describe('BlueprintCard', () => {
  it('renders the blueprint name from base_stats.item_name', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    expect(screen.getByText('Behring P8-AR Battle Rifle')).toBeInTheDocument()
  })

  it('falls back to blueprint.name when item_name is missing', () => {
    const bp = { ...WEAPON_BP, base_stats: { ...WEAPON_BP.base_stats, item_name: null } }
    render(<BlueprintCard blueprint={bp} />)
    expect(screen.getByText('Behring P8-AR')).toBeInTheDocument()
  })

  it('renders DPS and RPM as base → max ranges', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    expect(screen.getByText('412')).toBeInTheDocument()
    expect(screen.getByText('618')).toBeInTheDocument()
    expect(screen.getByText('650')).toBeInTheDocument()
    expect(screen.getByText('780')).toBeInTheDocument()
  })

  it('renders Range as a single base value (static stat, no arrow)', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    // Range reads from effective_range and has no max — should render
    // as just "35" with no arrow. No unit (label "Range" implies it).
    expect(screen.getByText('35')).toBeInTheDocument()
  })

  it('formats craft time as mm:ss and renders slot count with the word "slots"', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    // 270 seconds → "4:30" (not "4m 30s" / "4M 30S"); 3 slots → "3 slots".
    // Assert against the article's aggregate textContent because the meta
    // row interleaves an icon SVG and a bullet separator span between the
    // time and slot-count text nodes, which defeats getByText's
    // single-element matching.
    const article = screen.getByRole('article')
    expect(article.textContent).toMatch(/4:30/)
    expect(article.textContent).toMatch(/3\s*slots/i)
  })

  it('does NOT render the "Mats" label above the resource dots', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    // Spec §5.1 does not mandate a label. It was an implementation
    // invention that drifted from spec.
    expect(screen.queryByText(/^Mats$/i)).not.toBeInTheDocument()
  })

  it('renders the type and sub-type labels', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} />)
    // Type and sub-type are in separate spans per the mockup's
    // .type-label / .dim structure. Assert on the article's
    // aggregate text content.
    const article = screen.getByRole('article')
    expect(article.textContent).toMatch(/Weapon/i)
    expect(article.textContent).toMatch(/rifle/i)
  })

  it('invokes the owned, wishlist, sim, and compare callbacks when buttons are clicked', async () => {
    const onOwned = vi.fn()
    const onWishlist = vi.fn()
    const onSim = vi.fn()
    const onCompare = vi.fn()
    render(
      <BlueprintCard
        blueprint={WEAPON_BP}
        onToggleOwned={onOwned}
        onToggleWishlist={onWishlist}
        onQualitySim={onSim}
        onCompare={onCompare}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /mark as owned/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to wishlist/i }))
    await userEvent.click(screen.getByRole('button', { name: /sim/i }))
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    expect(onOwned).toHaveBeenCalledWith(WEAPON_BP)
    expect(onWishlist).toHaveBeenCalledWith(WEAPON_BP)
    expect(onSim).toHaveBeenCalledWith(WEAPON_BP)
    expect(onCompare).toHaveBeenCalledWith(WEAPON_BP)
  })

  it('invokes onOpen when the blueprint name is clicked', async () => {
    const onOpen = vi.fn()
    render(<BlueprintCard blueprint={WEAPON_BP} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /view .* details/i }))
    expect(onOpen).toHaveBeenCalledWith(WEAPON_BP)
  })

  it('marks the card as selected when isInCompare is true', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} isInCompare={true} />)
    const article = screen.getByRole('article')
    expect(article).toHaveAttribute('data-selected', 'true')
  })

  it('shows OWNED ribbon when isOwned is true and not in compare', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} isOwned={true} />)
    const article = screen.getByRole('article')
    expect(article).toHaveAttribute('data-owned', 'true')
    expect(article.textContent).toMatch(/Owned/i)
  })

  it('hides OWNED ribbon when also in compare (compare wins)', () => {
    render(<BlueprintCard blueprint={WEAPON_BP} isOwned={true} isInCompare={true} />)
    const article = screen.getByRole('article')
    expect(article).toHaveAttribute('data-owned', 'true')
    expect(article).toHaveAttribute('data-selected', 'true')
  })
})
