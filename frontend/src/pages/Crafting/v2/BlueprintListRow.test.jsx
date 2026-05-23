import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BlueprintListRow from './BlueprintListRow'

const BP = {
  id: 1,
  type: 'weapons',
  sub_type: 'rifle',
  name: 'Behring P8-AR',
  craft_time_seconds: 270,
  slots: [{ resource_name: 'Beryl' }, { resource_name: 'Tin' }],
  base_stats: {
    item_name: 'Behring P8-AR Battle Rifle',
    // dps_max / rounds_per_minute_max are FABRICATED for unit testing
    // — the real API doesn't return them yet (computed from crafting
    // modifiers in a follow-up batch).
    dps: 412, dps_max: 618,
    rounds_per_minute: 650, rounds_per_minute_max: 780,
    // effective_range is the real API field name. Range is static —
    // no crafting-quality modifier exists — so it has no max value.
    effective_range: 35,
  },
}

describe('BlueprintListRow', () => {
  it('renders DPS, RPM, and Range base values plus the DPS/RPM max values', () => {
    render(<BlueprintListRow blueprint={BP} />)
    ;['412', '618', '650', '780', '35'].forEach(n =>
      expect(screen.getByText(n)).toBeInTheDocument()
    )
  })

  it('renders Range max cell as an em dash (static stat, no max)', () => {
    render(<BlueprintListRow blueprint={BP} />)
    // With range as a static stat the max cell gets null → StatNumCell
    // renders an em dash. Only ONE em dash is expected in the row.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBe(1)
  })

  it('renders the blueprint name', () => {
    render(<BlueprintListRow blueprint={BP} />)
    expect(screen.getByText('Behring P8-AR Battle Rifle')).toBeInTheDocument()
  })

  it('renders the formatted craft time as mm:ss', () => {
    render(<BlueprintListRow blueprint={BP} />)
    // 270 seconds → "4:30" via formatCraftTime (the v2 helper that
    // replaced the legacy formatTime which output "4m 30s").
    const row = screen.getByRole('row')
    expect(row.textContent).toMatch(/4:30/)
  })

  it('invokes onCompare when compare action is clicked', async () => {
    const onCompare = vi.fn()
    render(<BlueprintListRow blueprint={BP} onCompare={onCompare} />)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    expect(onCompare).toHaveBeenCalledWith(BP)
  })

  it('invokes onOpen when the row body is clicked', async () => {
    const onOpen = vi.fn()
    render(<BlueprintListRow blueprint={BP} onOpen={onOpen} />)
    // Click the name cell (part of the row body, not an action button).
    await userEvent.click(screen.getByText('Behring P8-AR Battle Rifle'))
    expect(onOpen).toHaveBeenCalledWith(BP)
  })

  it('does NOT invoke onOpen when an action button is clicked', async () => {
    const onOpen = vi.fn()
    const onCompare = vi.fn()
    render(<BlueprintListRow blueprint={BP} onOpen={onOpen} onCompare={onCompare} />)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    expect(onCompare).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows selected data-attribute when isInCompare is true', () => {
    render(<BlueprintListRow blueprint={BP} isInCompare={true} />)
    const row = screen.getByRole('row')
    expect(row).toHaveAttribute('data-selected', 'true')
  })
})
