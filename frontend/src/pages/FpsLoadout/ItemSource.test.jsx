import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ItemSource from './ItemSource'

const weapons = [
  { uuid: 'w1', name: 'P4-AR Rifle', sub_type: 'rifle' },
  { uuid: 'w2', name: 'A03 Sniper Rifle', sub_type: 'sniper' },
]
const builds = [{ id: 1, name: 'CQB Build', weapon_uuid: 'w1', config: {} }]
const ownership = { owned: new Set(['w1']), wishlisted: new Set(['w2']) }

describe('ItemSource', () => {
  it('defaults to the Weapons tab with the "All" sub-filter active for a weapon slot', () => {
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={[]} ownership={{}} onPick={() => {}} />)
    expect(screen.getByTestId('type-weapons')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cat-all')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an owned tick for P4-AR, renders the custom build with a CUSTOM tag, and fires onPick on click', () => {
    const onPick = vi.fn()
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={builds} ownership={ownership} onPick={onPick} />)

    // P4-AR (owned) is visible under the default "All" sub-filter.
    expect(screen.getByText('P4-AR Rifle')).toBeInTheDocument()
    expect(screen.getByLabelText('owned')).toBeInTheDocument()

    // The saved build for this slot's weapon sits at the top, tagged as a custom design.
    expect(screen.getByText('CQB Build')).toBeInTheDocument()
    expect(screen.getByText(/CUSTOM Q/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('item-weapon-w1'))
    expect(onPick).toHaveBeenCalledWith(weapons[0])
  })

  it('narrows to the Sniper sub-filter, showing A03 with an aspirational badge and hiding P4-AR', () => {
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={[]} builds={[]} ownership={ownership} onPick={() => {}} />)

    // Narrow to Rifles first so A03 (a Sniper) is excluded.
    fireEvent.click(screen.getByTestId('cat-rifles'))
    expect(screen.queryByText('A03 Sniper Rifle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cat-sniper'))

    expect(screen.getByText('A03 Sniper Rifle')).toBeInTheDocument()
    expect(screen.getByLabelText('aspirational')).toBeInTheDocument()
    expect(screen.queryByText('P4-AR Rifle')).not.toBeInTheDocument()
  })

  it('renders a "coming soon" state for the Armour tab and an empty state for Utility', () => {
    render(<ItemSource slotKey="helmet" weapons={weapons} attachments={[]} builds={[]} ownership={{}} onPick={() => {}} />)
    expect(screen.getByTestId('type-armour')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Armour catalog coming soon/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('type-utility'))
    expect(screen.getByText(/No utility items match/)).toBeInTheDocument()
  })

  it('lists attachments on the Attach tab', () => {
    const attachments = [{ uuid: 'a1', name: 'Stark Barrel', sub_type: 'barrel' }]
    const onPick = vi.fn()
    render(<ItemSource slotKey="primary" weapons={[]} attachments={attachments} builds={[]} ownership={{}} onPick={onPick} />)

    fireEvent.click(screen.getByTestId('type-attach'))
    expect(screen.getByText('Stark Barrel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('item-attach-a1'))
    expect(onPick).toHaveBeenCalledWith(attachments[0])
  })

  // Regression: blueprint.name from useCrafting is the raw internal name
  // ("Behr Lmg Ballistic 01"); the friendly, player-facing name lives at
  // base_stats.item_name ("FS-9 LMG"). Both display and search must use it.
  it('shows and finds a weapon by its friendly base_stats.item_name, not its raw name', () => {
    const lmgWeapons = [
      { name: 'Behr Lmg Ballistic 01', base_stats: { item_name: 'FS-9 LMG', ammo_capacity: 50 }, sub_type: 'lmg' },
    ]
    render(<ItemSource slotKey="primary" weapons={lmgWeapons} attachments={[]} builds={[]} ownership={{}} onPick={() => {}} />)

    // Default category is "All", so no need to switch to LMG first.
    expect(screen.getByTestId('cat-all')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(screen.getByTestId('item-source-search'), { target: { value: 'FS' } })

    expect(screen.getByText('FS-9 LMG')).toBeInTheDocument()
    expect(screen.queryByText('Behr Lmg Ballistic 01')).not.toBeInTheDocument()
  })

  it('shows a saved build tagged with its resolved weapon name when enriched by the container', () => {
    const enrichedBuilds = [{ id: 1, name: 'CQB Build', weapon_uuid: 'w1', config: {}, weaponName: 'FS-9 LMG' }]
    render(<ItemSource slotKey="primary" weapons={[]} attachments={[]} builds={enrichedBuilds} ownership={{}} onPick={() => {}} />)
    expect(screen.getByText('CQB Build')).toBeInTheDocument()
    expect(screen.getByText(/FS-9 LMG/)).toBeInTheDocument()
  })

  // FIX 1: a design must be findable by its own name OR its weapon's friendly
  // name — a crafting-page quality-sim design named "my sim" on the FS-9
  // should still surface when the user searches "FS".
  it('finds a design by its weapon name when the design name does not match the search', () => {
    const designs = [{ id: 'bp-x-1', name: 'my sim', weaponUuid: 'x', weaponName: 'FS-9 LMG', config: {} }]
    render(<ItemSource slotKey="primary" weapons={[]} attachments={[]} builds={designs} ownership={{}} onPick={() => {}} />)
    fireEvent.change(screen.getByTestId('item-source-search'), { target: { value: 'FS' } })
    expect(screen.getByText('my sim')).toBeInTheDocument()
  })

  // Rows are dnd-kit drag sources (pointer-based, not native HTML5 DnD) —
  // dnd-kit marks them with role/aria-roledescription and pointer listeners.
  it('makes weapon and attachment rows dnd-kit draggables', () => {
    const attachments = [{ uuid: 'a1', name: 'Stark Barrel', sub_type: 'barrel', slot: 'barrel' }]
    render(<ItemSource slotKey="primary" weapons={weapons} attachments={attachments} builds={[]} ownership={{}} onPick={() => {}} />)
    expect(screen.getByTestId('item-weapon-w1')).toHaveAttribute('aria-roledescription', 'draggable')
    fireEvent.click(screen.getByTestId('type-attach'))
    expect(screen.getByTestId('item-attach-a1')).toHaveAttribute('aria-roledescription', 'draggable')
  })

  it('filters attachments by slot sub-filter (Optics / Barrels / Underbarrel)', () => {
    const attachments = [
      { uuid: 'a1', name: 'Stark Barrel', slot: 'barrel' },
      { uuid: 'a2', name: 'Delta Reflex', slot: 'optic' },
      { uuid: 'a3', name: 'FieldLite Flashlight', slot: 'underbarrel' },
    ]
    render(<ItemSource slotKey="primary" weapons={[]} attachments={attachments} builds={[]} ownership={{}} onPick={() => {}} />)
    fireEvent.click(screen.getByTestId('type-attach'))
    // All three visible by default
    expect(screen.getByTestId('item-attach-a1')).toBeInTheDocument()
    expect(screen.getByTestId('item-attach-a2')).toBeInTheDocument()
    // Optics only
    fireEvent.click(screen.getByTestId('cat-optics'))
    expect(screen.queryByTestId('item-attach-a1')).not.toBeInTheDocument()
    expect(screen.getByTestId('item-attach-a2')).toBeInTheDocument()
    expect(screen.queryByTestId('item-attach-a3')).not.toBeInTheDocument()
  })

  it('lists utility items with slot sub-filters; slot items drag, tool attachments do not', () => {
    const utility = [
      { uuid: 'u1', name: 'ParaMed Medical Device', util_slot: 'medical', manufacturer_name: 'CureLife' },
      { uuid: 'u2', name: 'Pyro RYT Multi-Tool', util_slot: 'gadget', manufacturer_name: 'Greycat' },
      { uuid: 'u3', name: 'MK-4 Frag Grenade', util_slot: 'throwable', manufacturer_name: 'Behring' },
      { uuid: 'u4', name: 'OxyTorch Cutter Attachment', util_slot: null, manufacturer_name: 'Greycat' },
    ]
    render(<ItemSource slotKey="medical" weapons={[]} attachments={[]} builds={[]} utility={utility} ownership={{}} onPick={() => {}} />)
    // slotKey=medical defaults the tab to Utility; all four listed under 'All'
    expect(screen.getByTestId('item-utility-u1')).toBeInTheDocument()
    expect(screen.getByTestId('item-utility-u4')).toBeInTheDocument()
    // Slot-equippable rows are draggable; tool attachments are not
    expect(screen.getByTestId('item-utility-u1')).toHaveAttribute('aria-roledescription', 'draggable')
    expect(screen.getByTestId('item-utility-u4')).not.toHaveAttribute('aria-roledescription')
    // Medical sub-filter narrows to the medgun
    fireEvent.click(screen.getByTestId('cat-medical'))
    expect(screen.getByTestId('item-utility-u1')).toBeInTheDocument()
    expect(screen.queryByTestId('item-utility-u2')).not.toBeInTheDocument()
    // Tool Attach. sub-filter shows only util_slot=null rows
    fireEvent.click(screen.getByTestId('cat-toolattach'))
    expect(screen.getByTestId('item-utility-u4')).toBeInTheDocument()
    expect(screen.queryByTestId('item-utility-u1')).not.toBeInTheDocument()
  })
})
