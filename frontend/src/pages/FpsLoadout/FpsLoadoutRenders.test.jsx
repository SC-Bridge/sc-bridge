import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ItemBench from './ItemBench'
import MyLoadout from './MyLoadout'

vi.mock('../../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({ data: { variants: [] }, loading: false, error: null }),
}))

const RENDER = { hash: 'beefbeefbeefbeef', width: 1024, height: 512, view: 'side' }

const weapon = (extra = {}) => ({
  uuid: 'w1', name: 'Behr Lmg Ballistic 01', type: 'weapons', slots: [],
  base_stats: { item_name: 'FS-9 LMG', loadout_icon: 'https://imagedelivery.net/x/lh86/public' },
  ...extra,
})

describe('FPS Loadout renders', () => {
  it('shows the weapon render in the bench header, ahead of its loadout icon, and opens the large view', () => {
    render(<ItemBench kind="weapon" attachments={[]} blueprint={weapon({
      render: RENDER, render_variants_kind: 'fps_weapon', render_item_key: 'behr_lmg_ballistic_01', render_variant: '',
    })} />)
    const header = screen.getByTestId('bench-combo-handle')
    const img = within(header).getByAltText('FS-9 LMG')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/beefbeefbeefbeef/512.webp')
    fireEvent.load(img)
    expect(within(header).getByRole('button', { name: 'Open large view of FS-9 LMG' })).toBeTruthy()
  })

  it('shows an armour piece render on the bench instead of the placeholder', () => {
    render(<ItemBench kind="armour" attachments={[]} blueprint={{
      uuid: 'a1', name: 'Kap Arms', type: 'armour', slots: [], base_stats: { item_name: 'Geist Armor Arms', armour_slot: 'arms' },
      render: RENDER, render_variants_kind: 'fps_armour', render_item_key: 'kap_combat_light_arms_01_01_01', render_variant: '',
    }} />)
    const header = screen.getByTestId('bench-combo-handle')
    expect(within(header).getByAltText('Geist Armor Arms')).toBeTruthy()
    expect(within(header).queryByText('no icon')).toBeNull()
  })

  it('shows the equipped item render in its paperdoll slot, and the slot icon when there is none', () => {
    render(<MyLoadout selectedSlot={null} onSelectSlot={() => {}} loadout={{
      id: 1, name: 'Kit', slots: [
        { slot_key: 'primary', item_uuid: 'w1', item_name: 'P4-AR Rifle', owned: false, wishlisted: false, render: RENDER },
        { slot_key: 'helmet', item_uuid: 'h1', item_name: 'Lp Helmet', owned: false, wishlisted: false, render: null },
      ],
    }} />)
    const primary = screen.getByTestId('slot-primary')
    expect(within(primary).getByAltText('P4-AR Rifle').getAttribute('src')).toBe('https://renders.scbridge.app/beefbeefbeefbeef/512.webp')
    const helmet = screen.getByTestId('slot-helmet')
    expect(helmet.querySelector('img').getAttribute('src')).toBe('/inventory-assets/icon_common_helmet.svg')
    // The tile itself is the button; the render inside it must not be one.
    expect(within(primary).queryByRole('button')).toBeNull()
  })
})
