import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WeaponBlock from './WeaponBlock'
import MissileBlock from './MissileBlock'
import LockedPort from './LockedPort'
import ComponentPicker from './ComponentPicker'
import GadgetSlots from './GadgetSlots'
import GadgetPicker from './GadgetPicker'
import { renderFields } from './loadoutHelpers'

vi.mock('../../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: '', view: 'iso', hash: 'r1', width: 2048, height: 1400, name: null }],
    loading: false,
    error: null,
  }),
}))

const PICKER_COMPONENTS = [
  {
    id: 1, uuid: 'u1', name: 'Rendered Plant', type: 'PowerPlant', size: 2, grade: 'A', shops: [],
    render: { hash: 'r1', width: 2048, height: 1400, view: 'iso' },
    render_variants_kind: 'vehicle_component', render_item_key: 'powr_test_rendered',
  },
  { id: 2, uuid: 'u2', name: 'Plain Plant', type: 'PowerPlant', size: 2, grade: 'B', shops: [], render: null },
]

const GADGET = {
  uuid: 'lm-mod', name: 'Render Module', size: 1,
  render: { hash: 'r1', width: 2048, height: 1400, view: 'iso' },
  render_variants_kind: 'vehicle_component', render_item_key: 'mmod_test_render',
}

vi.mock('../../hooks/useAPI', () => ({
  useHeadGadgets: () => ({
    data: { head_name: 'Helix', kind: 'mining', slots: [{ slot_index: 0, max_size: 1, compatible: [GADGET] }] },
  }),
  useCompatibleComponents: () => ({
    data: { components: PICKER_COMPONENTS, stock_uuid: 'u2', size_max: 2 },
    loading: false,
    error: null,
  }),
}))

// The large view keeps its selection in the URL, so every render needs a router.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const R = { hash: 'r1', width: 2048, height: 1400, view: 'iso' }
const SRC = 'https://renders.scbridge.app/r1/512.webp'
const GUN = {
  port_id: 10, child_name: 'CF-337 Panther', component_name: 'CF-337 Panther', component_size: 3, size_max: 3,
  render: R, render_variants_kind: 'vehicle_component', render_item_key: 'klwe_laserrepeater_s3',
}

describe('Ship Loadout renders', () => {
  it('shows the weapon thumbnail on a fixed mount and opens the large view without opening the picker', () => {
    const onClickWeapon = vi.fn()
    render(<WeaponBlock item={GUN} onClickWeapon={onClickWeapon} />)
    const img = screen.getByAltText('CF-337 Panther')
    expect(img.getAttribute('src')).toBe(SRC)

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of CF-337 Panther/ }))
    expect(screen.getByRole('dialog', { name: /CF-337 Panther renders/ })).toBeInTheDocument()
    expect(onClickWeapon).not.toHaveBeenCalled()
  })

  it('shows the weapon thumbnail under a gimbal', () => {
    render(<WeaponBlock item={{ ...GUN, mount_name: 'VariPuck S3 Gimbal Mount', sub_type: 'GunTurret' }} />)
    expect(screen.getByAltText('CF-337 Panther').getAttribute('src')).toBe(SRC)
  })

  it("shows the missile's thumbnail on a rack", () => {
    render(
      <MissileBlock item={{
        port_id: 11, mount_name: 'MSD-442 Missile Rack', child_name: 'Ignite II', component_size: 2, size_max: 4,
        missile_count: 2, render: R, render_variants_kind: 'ship_missile', render_item_key: 'misl_s02_ignite',
      }} />,
    )
    expect(screen.getByAltText('Ignite II').getAttribute('src')).toBe(SRC)
  })

  it('shows a thumbnail on a locked port', () => {
    render(<LockedPort item={{ ...GUN, editable: 0 }} />)
    expect(screen.getByAltText('CF-337 Panther').getAttribute('src')).toBe(SRC)
  })

  it('shows a thumbnail on each picker option, and a click on it does not select the option', () => {
    const onSelect = vi.fn()
    render(<ComponentPicker slug="ship" portId={1} portType="power" onSelect={onSelect} onClose={vi.fn()} />)
    const img = screen.getByAltText('Rendered Plant')
    expect(img.getAttribute('src')).toBe(SRC)
    expect(screen.getByRole('img', { name: /Plain Plant — image unavailable/ })).toBeInTheDocument()

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Rendered Plant/ }))
    expect(screen.getByRole('dialog', { name: /Rendered Plant renders/ })).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("shows the installed gadget's thumbnail in its slot", () => {
    render(<GadgetSlots headUuid="h" portName="p" selections={{ 'p#0': 'lm-mod' }} />)
    expect(screen.getByAltText('Render Module').getAttribute('src')).toBe(SRC)
  })

  it('shows a thumbnail on each gadget option, and a click on it does not install the gadget', () => {
    const onSelect = vi.fn()
    render(<GadgetPicker slotLabel="Helix · Slot 1" kind="mining" compatible={[GADGET]} onSelect={onSelect} onClose={vi.fn()} />)
    const img = screen.getByAltText('Render Module')
    expect(img.getAttribute('src')).toBe(SRC)

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Render Module/ }))
    expect(screen.getByRole('dialog', { name: /Render Module renders/ })).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('carries a picked component\'s render into its override, and clears the stock one when it has none', () => {
    expect(renderFields(PICKER_COMPONENTS[0])).toEqual({
      render: R, render_variants_kind: 'vehicle_component', render_item_key: 'powr_test_rendered',
    })
    expect(renderFields(PICKER_COMPONENTS[1])).toEqual({
      render: null, render_variants_kind: null, render_item_key: null,
    })
  })
})
