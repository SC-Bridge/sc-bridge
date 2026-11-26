// A link carrying ?render=<variant> opens the page's large render view on load,
// with that variant selected.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipDetail from './ShipDetail'
import PaintDetail from './PaintDetail'
import ArmorSetDetail from './ArmorSetDetail'

const { state, empty } = vi.hoisted(() => ({
  state: { ship: null, paint: null, set: null, calls: [] },
  empty: () => ({ data: null, loading: false, error: null, refetch: () => {} }),
}))

vi.mock('../hooks/useAPI', () => ({
  useShip: () => ({ data: state.ship, loading: false, error: null, refetch: () => {} }),
  usePaintDetail: () => ({ data: state.paint, loading: false, error: null, refetch: () => {} }),
  useLootSet: () => ({ data: state.set, loading: false, error: null, refetch: () => {} }),
  useLootCollection: empty,
  setLootCollectionQuantity: () => Promise.resolve(),
  useShipLoadout: empty,
  useShipPaints: empty,
  useShipSalvage: empty,
  useWeaponRacks: empty,
  useSuitLockers: empty,
  useFleet: empty,
  useFleetEntryUpgrades: empty,
  useShipModules: empty,
  useOwnedModules: empty,
  useOwnedPaints: empty,
  useStatus: empty,
  useRsiAccounts: empty,
}))

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({ data: null }),
}))

// Each item's variants; the viewer shows the one named by ?render=.
const VARIANTS = {
  aegs_gladius: [
    { variant: '', view: 'iso', hash: 'g0', width: 2048, height: 1024, name: null },
    { variant: 'paint_gladius_valiant', view: 'iso', hash: 'g1', width: 2048, height: 1024, name: 'Valiant' },
  ],
  'kap_arms,kap_core': [
    { variant: '', view: 'worn_male', hash: 'k0', width: 1024, height: 2048, name: null },
    { variant: '', view: 'worn_female', hash: 'k1', width: 1024, height: 2048, name: null },
  ],
}

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: (kind, itemKey) => {
    state.calls.push([kind, itemKey])
    return { variants: VARIANTS[itemKey] ?? [], loading: false, error: null }
  },
}))

const RENDER = { hash: 'g0', width: 2048, height: 1024, view: 'iso' }

function mainImageSrc() {
  return screen.getByRole('dialog').querySelector('img[src$="/2048.webp"]')?.getAttribute('src')
}

function at(entry, path, element) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path={path} element={element} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.calls = []
  state.ship = { slug: 'gladius', name: 'Gladius', class_name: 'AEGS_Gladius', render: RENDER }
  state.paint = {
    name: 'Valiant', slug: 'valiant', class_name: 'Paint_Gladius_Valiant', render: RENDER, vehicles: [],
    hull_renders: [
      { vehicle_slug: 'gladius', vehicle_name: 'Gladius', item_key: 'aegs_gladius', render: RENDER },
      { vehicle_slug: 'gladius-valiant', vehicle_name: 'Gladius Valiant', item_key: 'aegs_gladius_valiant', render: RENDER },
    ],
  }
  state.set = {
    setName: 'Kap Armor', manufacturer: null, pieces: [], awardingContracts: [],
    render: { hash: 'k0', width: 1024, height: 2048, view: 'worn_male' }, render_item_key: 'kap_arms,kap_core',
  }
})

describe('?render= deep links open the large view', () => {
  it('ShipDetail opens the viewer with the linked paint selected', () => {
    at('/ships/gladius?render=paint_gladius_valiant', '/ships/:slug', <ShipDetail />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(state.calls).toContainEqual(['vehicle', 'aegs_gladius'])
    expect(mainImageSrc()).toBe('https://renders.scbridge.app/g1/2048.webp')
  })

  it('ShipDetail stays closed without ?render=', () => {
    at('/ships/gladius', '/ships/:slug', <ShipDetail />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('PaintDetail opens the first hull viewer with the linked variant selected', () => {
    at('/paints/valiant?render=paint_gladius_valiant', '/paints/:slug', <PaintDetail />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(state.calls).toContainEqual(['vehicle', 'aegs_gladius'])
    expect(mainImageSrc()).toBe('https://renders.scbridge.app/g1/2048.webp')
  })

  it('PaintDetail stays closed without ?render=', () => {
    at('/paints/valiant', '/paints/:slug', <PaintDetail />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ArmorSetDetail opens the set viewer', () => {
    at('/loot/sets/kap?render=', '/loot/sets/:setSlug', <ArmorSetDetail />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(state.calls).toContainEqual(['armour_set', 'kap_arms,kap_core'])
    expect(mainImageSrc()).toBe('https://renders.scbridge.app/k0/2048.webp')
  })

  it('ArmorSetDetail stays closed without ?render=', () => {
    at('/loot/sets/kap', '/loot/sets/:setSlug', <ArmorSetDetail />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
