import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ComponentTable from './ComponentTable'
import CompareTable from './CompareTable'

vi.mock('../../hooks/useRenderVariants', () => ({
  useRenderVariants: () => ({
    variants: [{ variant: '', view: 'iso', hash: 'r1', width: 2048, height: 1400, name: null }],
    loading: false,
    error: null,
  }),
}))

const R = { hash: 'r1', width: 2048, height: 1400, view: 'iso' }
const SHIELD = {
  id: 1, name: 'FR-66', manufacturer_name: 'Gorgon', size: 2, shield_hp: 100,
  render: R, render_variants_kind: 'vehicle_component', render_item_key: 'shld_godi_s02_fr66',
}
const PLAIN = { id: 2, name: 'Plain Shield', manufacturer_name: 'Basilisk', size: 2, shield_hp: 90, render: null }
const COLUMNS = [
  { key: 'name', label: 'Name', align: 'left' },
  { key: 'shield_hp', label: 'HP' },
]

function table(components) {
  render(
    <MemoryRouter>
      <ComponentTable
        components={components} columns={COLUMNS} columnOrder={null}
        onReorderColumns={vi.fn()} onResetColumns={vi.fn()}
        isSelected={() => false} onToggleCompare={vi.fn()} compareCount={0} maxCompare={3}
      />
    </MemoryRouter>,
  )
}

describe('Components renders', () => {
  it('shows a row thumbnail in each name cell and opens the large view', () => {
    table([SHIELD, PLAIN])
    const img = screen.getByAltText('FR-66')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/r1/512.webp')
    expect(img.closest('td').textContent).toContain('FR-66')
    expect(screen.getByRole('img', { name: /Plain Shield — image unavailable/ })).toBeInTheDocument()

    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /Open large view of FR-66/ }))
    expect(screen.getByRole('dialog', { name: /FR-66 renders/ })).toBeInTheDocument()
  })

  it("shows each compared component's render", () => {
    render(<MemoryRouter><CompareTable items={[SHIELD, PLAIN]} apiType="shield" /></MemoryRouter>)
    expect(screen.getByAltText('FR-66').getAttribute('src')).toBe('https://renders.scbridge.app/r1/512.webp')
    expect(screen.getByRole('img', { name: /Plain Shield — image unavailable/ })).toBeInTheDocument()
  })
})
