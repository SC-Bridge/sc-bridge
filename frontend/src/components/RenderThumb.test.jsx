import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RenderThumb from './RenderThumb'

const calls = vi.hoisted(() => [])

vi.mock('../hooks/useRenderVariants', () => ({
  useRenderVariants: (kind, itemKey) => {
    calls.push([kind, itemKey])
    return {
      variants: [{ variant: '', view: 'iso', hash: 'r0', width: 2048, height: 1024, name: null }],
      loading: false,
      error: null,
    }
  },
}))

const R = { hash: 'r0', width: 2048, height: 1024, view: 'iso' }

function inRow(ui, onRowClick = vi.fn()) {
  render(
    <MemoryRouter>
      <table><tbody><tr onClick={onRowClick}><td>{ui}</td></tr></tbody></table>
    </MemoryRouter>,
  )
  return onRowClick
}

describe('RenderThumb', () => {
  it('shows the 512 render at row size', () => {
    inRow(<RenderThumb render={R} kind="vehicle_component" itemKey="shld_s1" title="Shield" />)
    const img = screen.getByAltText('Shield')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/r0/512.webp')
    expect(img.closest('div').className).toMatch(/\bw-10\b/)
  })

  it('opens the large view for its kind and key without triggering the row', () => {
    const onRowClick = inRow(<RenderThumb render={R} kind="vehicle_component" itemKey="shld_s1" title="Shield" />)
    fireEvent.load(screen.getByAltText('Shield'))
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Shield/ }))
    expect(calls).toContainEqual(['vehicle_component', 'shld_s1'])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('opens the large view inside a link without following the link', () => {
    render(
      <MemoryRouter>
        <a href="/loot/item-1">
          <RenderThumb render={R} kind="vehicle_component" itemKey="shld_s1" title="Shield" />
        </a>
      </MemoryRouter>,
    )
    fireEvent.load(screen.getByAltText('Shield'))
    const notCancelled = fireEvent.click(screen.getByRole('button', { name: /Open large view of Shield/ }))
    expect(notCancelled).toBe(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the placeholder and cannot open without a render', () => {
    const onRowClick = inRow(<RenderThumb render={null} kind="vehicle_component" itemKey="shld_s1" title="Shield" />)
    const placeholder = screen.getByRole('img', { name: /Shield — image unavailable/ })
    expect(screen.queryByRole('button', { name: /Open large view/ })).toBeNull()
    fireEvent.click(placeholder)
    expect(onRowClick).toHaveBeenCalled()
  })

  it('cannot open without a kind and key, but still shows the render', () => {
    inRow(<RenderThumb render={R} title="Shield" />)
    const img = screen.getByAltText('Shield')
    fireEvent.load(img)
    expect(screen.queryByRole('button', { name: /Open large view/ })).toBeNull()
  })
})
