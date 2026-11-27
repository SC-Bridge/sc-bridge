import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import EquipmentCard from './EquipmentCard'
import EquipmentDetail from './EquipmentDetail'

const RENDER = { hash: 'm1m1m1m1m1m1m1m1', width: 1024, height: 768, view: 'iso' }

function renderCard(item) {
  return render(
    <MemoryRouter initialEntries={['/mining']}>
      <Routes>
        <Route path="/mining" element={<EquipmentCard item={item} equipType="laser" />} />
        <Route path="/mining/laser/:id" element={<p>laser detail</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EquipmentCard render', () => {
  it('shows the laser render when it has one', () => {
    renderCard({ id: 7, name: 'Arbor MH1', size: 1, render: RENDER, render_variants_kind: 'vehicle_component', render_item_key: 'mining_laser_grin_arbor_s1', render_variant: '' })
    expect(screen.getByAltText('Arbor MH1').getAttribute('src')).toBe('https://renders.scbridge.app/m1m1m1m1m1m1m1m1/512.webp')
  })

  it('shows no image when there is no render', () => {
    renderCard({ id: 8, name: 'Helix I', size: 2, render: null })
    expect(screen.queryByAltText('Helix I')).toBeNull()
  })

  it('opens the detail page from the keyboard', () => {
    renderCard({ id: 7, name: 'Arbor MH1', size: 1, render: null })
    fireEvent.keyDown(screen.getByRole('button', { name: /Arbor MH1/ }), { key: 'Enter' })
    expect(screen.getByText('laser detail')).toBeTruthy()
  })

  it('does not put a button inside another button', () => {
    const { container } = renderCard({ id: 7, name: 'Arbor MH1', size: 1, render: RENDER, render_variants_kind: 'vehicle_component', render_item_key: 'mining_laser_grin_arbor_s1', render_variant: '' })
    expect(container.querySelector('button button')).toBeNull()
  })
})

vi.mock('../../hooks/useAPI', () => ({
  useMining: () => ({
    data: {
      lasers: [{ id: 7, name: 'Arbor MH1', size: 1, render: RENDER, render_variants_kind: 'vehicle_component', render_item_key: 'mining_laser_grin_arbor_s1', render_variant: '' }],
      modules: [{ id: 3, name: 'Brandt Module', type: 'active', render: null }],
      gadgets: [],
    },
    loading: false, error: null, refetch: () => {},
  }),
}))

function renderDetail(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mining/:type/:id" element={<EquipmentDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EquipmentDetail render', () => {
  it('shows the large render in the header', () => {
    renderDetail('/mining/laser/7')
    expect(screen.getByAltText('Arbor MH1').getAttribute('src')).toBe('https://renders.scbridge.app/m1m1m1m1m1m1m1m1/2048.webp')
  })

  it('shows no image for equipment without a render', () => {
    renderDetail('/mining/module/3')
    expect(screen.queryByAltText('Brandt Module')).toBeNull()
  })
})
