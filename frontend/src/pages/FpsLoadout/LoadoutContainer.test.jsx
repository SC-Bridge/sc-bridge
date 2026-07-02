// frontend/src/pages/FpsLoadout/LoadoutContainer.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const WEAPON_PRIMARY = {
  uuid: 'w-primary', name: 'P4-AR Rifle', type: 'weapons', sub_type: 'rifle',
  base_stats: { damage: 22, rounds_per_minute: 600, dps: 220, ammo_capacity: 30 },
  slots: [{ name: 'Frame', resource_name: 'Titanium', slot_type: 'resource', modifiers: [] }],
}
const WEAPON_SECONDARY = {
  uuid: 'w-secondary', name: 'C54 SMG', type: 'weapons', sub_type: 'smg',
  base_stats: { damage: 15, rounds_per_minute: 700, dps: 175, ammo_capacity: 45 },
  slots: [{ name: 'Barrel', resource_name: 'Iron', slot_type: 'resource', modifiers: [] }],
}
// A named/skin variant of the primary weapon — not independently craftable,
// so it must be excluded from the catalog (base weapons only).
const WEAPON_VARIANT = {
  uuid: 'w-variant', name: 'P4-AR Rifle Ballistic 01', type: 'weapons', sub_type: 'rifle',
  base_stats: { item_name: 'P4-AR "Blacklist" Rifle', damage: 22, rounds_per_minute: 600, dps: 220, ammo_capacity: 30 },
  slots: [{ name: 'Frame', resource_name: 'Titanium', slot_type: 'resource', modifiers: [] }],
}
const BUILD_SECONDARY = {
  id: 5, name: 'Stealth SMG', weapon_uuid: 'w-secondary', config: { qualities: { 0: 500 }, attachments: {} },
}
// The FS-9 LMG — used to verify the bench's default-weapon fallback (FIX 3).
const WEAPON_FS9 = {
  uuid: 'w-fs9', name: 'Behr Lmg Ballistic 01', type: 'weapons', sub_type: 'lmg',
  base_stats: { item_name: 'FS-9 LMG', damage: 10, rounds_per_minute: 500, dps: 100, ammo_capacity: 50 },
  slots: [{ name: 'Frame', resource_name: 'Titanium', slot_type: 'resource', modifiers: [] }],
}
// A crafting-page quality-sim design (user_blueprint_builds via createBlueprintBuild) —
// FIX 1: these must surface in Item Source alongside user_weapon_builds designs.
const CRAFTING_DESIGN_PRIMARY = {
  blueprint_uuid: 'w-primary', blueprint_name: 'P4-AR Rifle', item_name: 'P4-AR Rifle', sub_type: 'rifle',
  builds: [{ id: 9, name: 'Ranked Loadout', quality_config: { 0: 700 } }],
}

const LOADOUT = {
  id: 1,
  name: 'Ground Ops',
  slots: [
    { slot_key: 'primary', item_uuid: 'w-primary', item_name: 'P4-AR Rifle', weapon_build_id: null,
      owned: true, wishlisted: false, config: { qualities: { 0: 500 }, attachments: {} } },
    { slot_key: 'secondary', item_uuid: 'w-secondary', item_name: 'C54 SMG', weapon_build_id: null,
      owned: false, wishlisted: true, config: { qualities: { 0: 500 }, attachments: {} } },
  ],
}

const refetchLoadouts = vi.fn()

vi.mock('../../hooks/useAPI', () => ({
  useFpsLoadouts: () => ({ data: { items: [LOADOUT] }, loading: false, error: null, refetch: refetchLoadouts }),
  createFpsLoadout: vi.fn(() => Promise.resolve({ id: 2 })),
  putLoadoutSlot: vi.fn(() => Promise.resolve({ ok: true })),
  useCrafting: () => ({ data: { blueprints: [WEAPON_PRIMARY, WEAPON_SECONDARY, WEAPON_VARIANT, WEAPON_FS9] }, loading: false, error: null }),
  useWeaponBench: () => ({ data: { attachments: [] }, loading: false, error: null }),
  useWeaponBuilds: () => ({ data: { items: [BUILD_SECONDARY] }, loading: false, error: null, refetch: vi.fn() }),
  useUserBlueprints: () => ({ data: { items: [CRAFTING_DESIGN_PRIMARY] }, loading: false, error: null }),
  useUtilityItems: () => ({ data: { items: [{ uuid: 'u-medgun', name: 'ParaMed Medical Device', util_slot: 'medical' }] }, loading: false, error: null }),
  createWeaponBuild: vi.fn(() => Promise.resolve({})),
  deleteWeaponBuild: vi.fn(() => Promise.resolve({})),
  useLootCollection: () => ({ data: [{ loot_uuid: 'w-primary', quantity: 1 }], loading: false }),
  useLootWishlist: () => ({ data: [{ uuid: 'w-secondary', name: 'C54 SMG' }], loading: false }),
}))

vi.mock('../../lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } } }),
}))

import LoadoutContainer from './LoadoutContainer'
import { putLoadoutSlot } from '../../hooks/useAPI'

describe('LoadoutContainer', () => {
  it('renders the paperdoll, bench, item source, and loadout stats zones', () => {
    render(<LoadoutContainer />)
    expect(screen.getByTestId('slot-primary')).toBeInTheDocument() // MyLoadout
    expect(screen.getByRole('heading', { name: 'P4-AR Rifle' })).toBeInTheDocument() // bench header (default slot = primary)
    expect(screen.getByTestId('item-source-search')).toBeInTheDocument() // ItemSource
    expect(screen.getByTestId('weapon-stats-table')).toBeInTheDocument() // LoadoutStats
  })

  it('loads the bench with the saved weapon when a different weapon slot is clicked', () => {
    render(<LoadoutContainer />)
    expect(screen.getByRole('heading', { name: 'P4-AR Rifle' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('slot-secondary'))
    expect(screen.getByRole('heading', { name: 'C54 SMG' })).toBeInTheDocument()
  })

  it('shows a slice-2 placeholder for non-weapon slots instead of the bench', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-helmet'))
    expect(screen.getByTestId('slot-placeholder')).toHaveTextContent(/coming in slice 2/i)
  })

  it('calls putLoadoutSlot with the bench config when "Set to loadout" is clicked', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'primary',
      expect.objectContaining({ itemUuid: 'w-primary', itemName: 'P4-AR Rifle', config: expect.any(Object) }),
    )
  })

  // Regression for the initialConfig-reference bug: initialConfig used to be
  // rebuilt as a fresh object every render, so WeaponBench's reset effect
  // (keyed on that reference) wiped in-progress slider edits on *any*
  // unrelated re-render of LoadoutContainer (e.g. after Save build triggers
  // buildsQ.refetch()). initialConfig must now be memoized so the bench only
  // resets when the selected slot's source item actually changes.
  it('does not reset bench edits on an unrelated re-render', () => {
    const { rerender } = render(<LoadoutContainer />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '750' } })
    expect(slider).toHaveValue('750')

    // Re-render the same instance — nothing about the selected slot or
    // weapon changed, so this should not touch the bench's live state.
    rerender(<LoadoutContainer />)

    expect(screen.getByRole('slider')).toHaveValue('750')
  })

  // Regression: the item source's "Set to loadout" write used to save the
  // blueprint's raw internal name — friendly base_stats.item_name must win.
  it('saves the friendly weapon name to the slot when "Set to loadout" is clicked', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-secondary')) // no base_stats.item_name — raw name still expected
    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'secondary',
      expect.objectContaining({ itemUuid: 'w-secondary', itemName: 'C54 SMG' }),
    )
  })

  // FIX 4: named/skin variants aren't independently craftable — only base weapons are.
  it('excludes named/skin weapon variants from the catalog (base weapons only)', () => {
    render(<LoadoutContainer />)
    fireEvent.change(screen.getByTestId('item-source-search'), { target: { value: 'Blacklist' } })
    expect(screen.queryByText(/Blacklist/)).not.toBeInTheDocument()
    expect(screen.getByText(/No weapons match/)).toBeInTheDocument()
  })

  // FIX 3: saved builds for weapons other than the one currently on the bench
  // must still surface via Item Source search, and picking one must load its
  // own weapon into the bench — not just apply when that weapon was already selected.
  it('surfaces a saved build for a different weapon via search, and loads that weapon on pick', () => {
    render(<LoadoutContainer />)
    expect(screen.getByRole('heading', { name: 'P4-AR Rifle' })).toBeInTheDocument() // default slot = primary

    fireEvent.change(screen.getByTestId('item-source-search'), { target: { value: 'Stealth' } })
    const buildRow = screen.getByTestId('item-build-5')
    expect(buildRow).toHaveTextContent('Stealth SMG')
    expect(buildRow).toHaveTextContent('C54 SMG') // enriched with its resolved weapon name

    fireEvent.click(buildRow)

    expect(screen.getByRole('heading', { name: 'C54 SMG' })).toBeInTheDocument()
  })

  // FIX 1: a build made in the Crafting page's quality sim (user_blueprint_builds,
  // surfaced via useUserBlueprints) must appear in Item Source, not just designs
  // saved from the bench itself (user_weapon_builds / useWeaponBuilds).
  it("surfaces the user's crafting-page quality-sim designs in Item Source, and loads their config on pick", () => {
    render(<LoadoutContainer />)
    const row = screen.getByTestId('item-build-bp-w-primary-9')
    expect(row).toHaveTextContent('Ranked Loadout')

    fireEvent.click(row)

    // Still the P4-AR (design's own weapon), but with the design's quality config applied.
    expect(screen.getByRole('heading', { name: 'P4-AR Rifle' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('700')
  })

  // FIX 3: an empty weapon slot (no saved item, nothing picked) should default
  // the bench to the FS-9 LMG, not whatever weapon sorts first alphabetically.
  it('defaults an empty weapon slot to the FS-9 LMG', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-sidearm')) // no saved slot in LOADOUT, nothing picked
    expect(screen.getByRole('heading', { name: 'FS-9 LMG' })).toBeInTheDocument()
  })
})
