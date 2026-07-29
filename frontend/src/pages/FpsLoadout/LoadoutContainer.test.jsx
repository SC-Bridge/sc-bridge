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
  id: 5, kind: 'weapon', name: 'Stealth SMG', item_uuid: 'w-secondary', config: { qualities: { 0: 500 }, attachments: {} },
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
// Two armour pieces on different slots — used to verify handlePick routes an
// armour catalog pick to the PIECE's own slot, not whatever's selected.
const ARMOUR_CORE = {
  uuid: 'a-core', name: 'Explorer_Core_01', type: 'armour', sub_type: 'core',
  base_stats: { item_name: 'Explorer Core', armour_slot: 'core', armour_weight: 'light', resist_physical: 0.2, weight: 3.5 },
  slots: [{ name: 'Padding', resource_name: 'Synthetic Fiber', slot_type: 'resource', modifiers: [] }],
}
const ARMOUR_ARMS = {
  uuid: 'a-arms', name: 'Explorer_Arms_01', type: 'armour', sub_type: 'arms',
  base_stats: { item_name: 'Explorer Arms', armour_slot: 'arms', armour_weight: 'light', resist_physical: 0.15, weight: 1.2 },
  slots: [{ name: 'Padding', resource_name: 'Synthetic Fiber', slot_type: 'resource', modifiers: [] }],
}
// A heavy core + legs, equipped in LOADOUT below — drives portCapacity so
// the utility paperdoll groups (grenades/mags/slings/pens/util) render tiles.
const ARMOUR_CORE_HEAVY = {
  uuid: 'a-core-heavy', name: 'Marauder_Core_01', type: 'armour', sub_type: 'core',
  base_stats: { item_name: 'Marauder Core', armour_slot: 'core', armour_weight: 'heavy', resist_physical: 0.4, weight: 6 },
  slots: [{ name: 'Padding', resource_name: 'Synthetic Fiber', slot_type: 'resource', modifiers: [] }],
}
const ARMOUR_LEGS = {
  uuid: 'a-legs', name: 'Marauder_Legs_01', type: 'armour', sub_type: 'legs',
  base_stats: { item_name: 'Marauder Legs', armour_slot: 'legs', armour_weight: 'heavy', resist_physical: 0.35, weight: 4 },
  slots: [{ name: 'Padding', resource_name: 'Synthetic Fiber', slot_type: 'resource', modifiers: [] }],
}

const LOADOUT = {
  id: 1,
  name: 'Ground Ops',
  slots: [
    { slot_key: 'primary', item_uuid: 'w-primary', item_name: 'P4-AR Rifle', weapon_build_id: null,
      owned: true, wishlisted: false, config: { qualities: { 0: 500 }, attachments: {} } },
    { slot_key: 'secondary', item_uuid: 'w-secondary', item_name: 'C54 SMG', weapon_build_id: null,
      owned: false, wishlisted: true, config: { qualities: { 0: 500 }, attachments: {} } },
    { slot_key: 'core', item_uuid: 'a-core-heavy', item_name: 'Marauder Core', weapon_build_id: null,
      owned: true, wishlisted: false, config: { qualities: {} } },
    { slot_key: 'legs', item_uuid: 'a-legs', item_name: 'Marauder Legs', weapon_build_id: null,
      owned: true, wishlisted: false, config: { qualities: {} } },
    // A weapon saved into a sling slot — used to verify attachments dropped
    // straight onto a FILLED sling tile merge into its config, same as a
    // filled primary/secondary/sidearm tile does.
    { slot_key: 'sling_1', item_uuid: 'w-primary', item_name: 'P4-AR Rifle', weapon_build_id: null,
      owned: true, wishlisted: false, config: { qualities: {}, attachments: {} } },
  ],
}

// No attachment_ports on WEAPON_PRIMARY.base_stats, so isCompatible() is
// permissive (no port data to enforce) — any attachment fits.
const ATTACHMENT_SCOPE = { uuid: 'att-scope', name: 'Devastator Scope', slot: 'optic', attach_port_type: 'IronSight', attach_size: 1 }

const refetchLoadouts = vi.fn()
const duplicateFpsLoadout = vi.fn(() => Promise.resolve({ ok: true, id: 9, name: 'Copy of Ground Ops' }))

vi.mock('../../hooks/useAPI', () => ({
  useFpsLoadouts: () => ({ data: { items: [LOADOUT] }, loading: false, error: null, refetch: refetchLoadouts }),
  createFpsLoadout: vi.fn(() => Promise.resolve({ id: 2 })),
  putLoadoutSlot: vi.fn(() => Promise.resolve({ ok: true })),
  duplicateFpsLoadout: (...args) => duplicateFpsLoadout(...args),
  useCrafting: () => ({ data: { blueprints: [WEAPON_PRIMARY, WEAPON_SECONDARY, WEAPON_VARIANT, WEAPON_FS9, ARMOUR_CORE, ARMOUR_ARMS, ARMOUR_CORE_HEAVY, ARMOUR_LEGS] }, loading: false, error: null }),
  useWeaponBench: () => ({ data: { attachments: [], magazines: [{ uuid: 'mg1', name: '30rd Mag', size: 2, magazine_capacity: 30, fits_class: 'behr_lmg_ballistic_01' }] }, loading: false, error: null }),
  useItemBuilds: () => ({ data: { items: [BUILD_SECONDARY] }, loading: false, error: null, refetch: vi.fn() }),
  useUserBlueprints: () => ({ data: { items: [CRAFTING_DESIGN_PRIMARY] }, loading: false, error: null }),
  useUtilityItems: () => ({ data: { items: [{ uuid: 'u-medgun', name: 'ParaMed Medical Device', util_slot: 'medical' }, { uuid: 'u-knife', name: 'Combat Knife', util_slot: 'knife' }] }, loading: false, error: null }),
  createItemBuild: vi.fn(() => Promise.resolve({})),
  deleteItemBuild: vi.fn(() => Promise.resolve({})),
  useLootCollection: () => ({ data: [{ loot_uuid: 'w-primary', quantity: 1 }], loading: false }),
  useLootWishlist: () => ({ data: [{ uuid: 'w-secondary', name: 'C54 SMG' }], loading: false }),
}))

vi.mock('../../lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } } }),
}))

// Real drag/drop is a full pointer gesture dnd-kit resolves via live rect
// collision — not practical to simulate in jsdom, and this codebase has no
// existing precedent for it. DndContext's onDragEnd is captured here instead
// (everything else — useDroppable/useDraggable/DragOverlay/collision
// detection — stays real) so a drop can be exercised directly against the
// container's actual handler.
const dndHandlers = {}
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    DndContext: (props) => {
      dndHandlers.onDragEnd = props.onDragEnd
      dndHandlers.onDragStart = props.onDragStart
      dndHandlers.onDragCancel = props.onDragCancel
      return props.children
    },
  }
})

function simulateDrop(drag, target) {
  return dndHandlers.onDragEnd({
    active: { data: { current: drag } },
    collisions: [{ data: { droppableContainer: { data: { current: target } } } }],
    over: { data: { current: target } },
  })
}

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

  it('shows a slice-3 placeholder for the remaining (non-sling) utility slots instead of the bench', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-pen_1'))
    expect(screen.getByTestId('slot-placeholder')).toHaveTextContent(/coming in slice 3/i)
  })

  it('renders the bench (not the slice-3 placeholder) for an armour slot', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-helmet'))
    expect(screen.queryByTestId('slot-placeholder')).not.toBeInTheDocument()
    expect(screen.getByText(/Select an armour piece from Item Source/)).toBeInTheDocument()
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
  // rebuilt as a fresh object every render, so ItemBench's reset effect
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
  // saved from the bench itself (user_item_builds / useItemBuilds).
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

  // Live staging bug: handlePick pinned every pick to selectedSlot — with
  // Core selected, clicking an Arms piece in Item Source left the bench (and
  // "Set to loadout") targeting Core, so Set-to-loadout would have persisted
  // the arms piece into the core slot. Armour pieces must jump to their OWN
  // slot on pick, mirroring the drop paths (equip-armour/load-bench).
  it('clicking an armour piece from a different slot targets that piece\'s own slot, not the currently selected one', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-core'))
    // Selecting Core now also narrows the Armour sub-filter to the Core pill
    // (slot-follow); widen back to "All" to browse across slots, as this test
    // is exercising cross-slot pick-routing, not slot-follow itself.
    fireEvent.click(screen.getByTestId('cat-all'))
    fireEvent.click(screen.getByTestId('item-armour-a-arms'))

    expect(screen.getByTestId('set-to-loadout')).toHaveTextContent('arms')

    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'arms',
      expect.objectContaining({ itemUuid: 'a-arms' }),
    )
  })

  // Regression: weapon slots are interchangeable (primary/secondary/sidearm),
  // so clicking a weapon must keep targeting whichever weapon slot is selected.
  it('clicking a weapon keeps targeting the currently selected weapon slot', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-primary'))
    fireEvent.click(screen.getByTestId('item-weapon-w-secondary'))

    expect(screen.getByRole('heading', { name: 'C54 SMG' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'primary',
      expect.objectContaining({ itemUuid: 'w-secondary' }),
    )
  })

  // Mirror of the armour fix above: with an armour slot selected, the picked
  // weapon can't resolve in the armour benchCatalog, so the bench appeared
  // dead. Weapon picks must jump OUT of an armour slot onto a weapon slot.
  it('clicking a weapon while an armour slot is selected jumps to a weapon slot', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-arms'))
    fireEvent.click(screen.getByTestId('type-weapons'))
    fireEvent.click(screen.getByTestId('item-weapon-w-primary'))

    expect(screen.getByRole('heading', { name: 'P4-AR Rifle' })).toBeInTheDocument()
    expect(screen.getByTestId('set-to-loadout')).toHaveTextContent('Primary')

    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'primary',
      expect.objectContaining({ itemUuid: 'w-primary' }),
    )
  })

  // Weapon-slot invariance: picking a weapon while a non-primary weapon slot
  // is already selected must stay on that slot (the three weapon slots are
  // interchangeable — only an armour-slot selection needs to jump).
  it('clicking a weapon while a weapon slot is already selected stays on that slot', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-secondary'))
    fireEvent.click(screen.getByTestId('item-weapon-w-primary'))

    expect(screen.getByTestId('set-to-loadout')).toHaveTextContent('Secondary')

    fireEvent.click(screen.getByTestId('set-to-loadout'))
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'secondary',
      expect.objectContaining({ itemUuid: 'w-primary' }),
    )
  })

  // Live staging bug: <ItemSource key={selectedSlot}> remounted on every slot
  // change, wiping the search box (and all pill state) — increasingly
  // disruptive now that armour/weapon picks jump the selected slot. Search
  // text must persist across slot changes; only the active TYPE tab should
  // follow the newly selected slot's default.
  it('preserves the item-source search text across a slot change, while the tab follows the new slot\'s default', () => {
    render(<LoadoutContainer />)
    fireEvent.change(screen.getByTestId('item-source-search'), { target: { value: 'Rifle' } })
    expect(screen.getByTestId('item-source-search')).toHaveValue('Rifle')

    fireEvent.click(screen.getByTestId('slot-helmet'))

    expect(screen.getByTestId('item-source-search')).toHaveValue('Rifle')
    expect(screen.getByTestId('type-armour')).toHaveAttribute('aria-pressed', 'true')
  })

  // Slice 3: capacity is derived from the loadout's equipped core + legs
  // (portCapacity) and threaded into MyLoadout — LOADOUT here has a heavy
  // core + legs equipped, so all 4 grenade tiles should render.
  it('computes capacity from the equipped core/legs armour and passes it to MyLoadout', () => {
    render(<LoadoutContainer />)
    for (let i = 1; i <= 4; i++) expect(screen.getByTestId(`slot-grenade_${i}`)).toBeInTheDocument()
    for (let i = 1; i <= 8; i++) expect(screen.getByTestId(`slot-mag_${i}`)).toBeInTheDocument()
    for (let i = 1; i <= 2; i++) expect(screen.getByTestId(`slot-sling_${i}`)).toBeInTheDocument()
  })

  it('duplicates the active loadout and switches to the new one', async () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('duplicate-loadout'))
    expect(duplicateFpsLoadout).toHaveBeenCalledWith(1)
    await vi.waitFor(() => expect(refetchLoadouts).toHaveBeenCalled())
  })

  it('surfaces a duplicate failure via the save flash', async () => {
    duplicateFpsLoadout.mockImplementationOnce(() => Promise.reject(new Error('name taken')))
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('duplicate-loadout'))
    await vi.waitFor(() => expect(screen.getByTestId('save-flash')).toHaveTextContent(/name taken/))
  })

  // Slice 3: a utility drop must persist to its ordinal slot key exactly like
  // a weapon/armour drop persists to a fixed one — proving persistSlot works
  // generically now that utility slot keys are dynamic (pen_2, not 'medical').
  it('persists a dropped utility item to a dynamic ordinal slot (pen_2)', async () => {
    render(<LoadoutContainer />)
    const medgun = { uuid: 'u-medgun', name: 'ParaMed Medical Device', util_slot: 'medical' }
    await simulateDrop({ kind: 'utility', item: medgun }, { kind: 'loadout-slot', slotKey: 'pen_2' })
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'pen_2',
      expect.objectContaining({ itemUuid: 'u-medgun', itemName: 'ParaMed Medical Device' }),
    )
  })

  it('persists a dropped knife to util_knife via equip-melee', async () => {
    render(<LoadoutContainer />)
    const knife = { uuid: 'u-knife', name: 'Combat Knife' }
    await simulateDrop({ kind: 'melee', item: knife }, { kind: 'loadout-slot', slotKey: 'util_knife' })
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'util_knife',
      expect.objectContaining({ itemUuid: 'u-knife', itemName: 'Combat Knife' }),
    )
  })

  it('persists a dropped magazine to a mag_* slot via equip-magazine', async () => {
    render(<LoadoutContainer />)
    const magazine = { uuid: 'mg1', name: '30rd Mag' }
    await simulateDrop({ kind: 'magazine', magazine }, { kind: 'loadout-slot', slotKey: 'mag_3' })
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'mag_3',
      expect.objectContaining({ itemUuid: 'mg1', itemName: '30rd Mag' }),
    )
  })

  it('renders the weapon bench (not the slice-3 placeholder) for a sling slot', () => {
    render(<LoadoutContainer />)
    fireEvent.click(screen.getByTestId('slot-sling_1'))
    expect(screen.queryByTestId('slot-placeholder')).not.toBeInTheDocument()
  })

  // FIX: slotWeapons (drives attachment-drop validation on a FILLED paperdoll
  // tile) only recognised primary/secondary/sidearm — a sling tile carrying a
  // saved weapon silently rejected an attachment dropped straight onto it.
  it('merges an attachment dropped onto a FILLED sling tile into that slot\'s config, same as a weapon slot', async () => {
    render(<LoadoutContainer />)
    await simulateDrop({ kind: 'attachment', attachment: ATTACHMENT_SCOPE }, { kind: 'loadout-slot', slotKey: 'sling_1' })
    expect(putLoadoutSlot).toHaveBeenCalledWith(
      1,
      'sling_1',
      expect.objectContaining({
        itemUuid: 'w-primary',
        config: expect.objectContaining({ attachments: expect.objectContaining({ optic: 'att-scope' }) }),
      }),
    )
  })
})
