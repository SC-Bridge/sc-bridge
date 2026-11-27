import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SizeLineup from './SizeLineup'

const side = (hash) => ({ hash, width: 2048, height: 512, view: 'side' })
const SHIPS = [
  { slug: 'carrack', name: 'Carrack', length: 126, side_render: side('c4c4c4c4c4c4c4c4') },
  { slug: 'arrow', name: 'Arrow', length: 17.2, side_render: side('a1a1a1a1a1a1a1a1') },
  { slug: 'cutlass', name: 'Cutlass Black', length: 37.5, side_render: side('b2b2b2b2b2b2b2b2') },
  { slug: 'pisces', name: 'C8 Pisces', length: 16, side_render: null },
  { slug: 'concept', name: 'Concept Ship', length: null, side_render: side('d3d3d3d3d3d3d3d3') },
]

const renderLineup = (ships = SHIPS) => render(<MemoryRouter><SizeLineup ships={ships} /></MemoryRouter>)

describe('SizeLineup', () => {
  it('draws each ship with a side render, smallest to largest, sized by its length', () => {
    renderLineup()
    const items = screen.getAllByTestId('lineup-ship')
    expect(items.map((el) => el.dataset.slug)).toEqual(['arrow', 'cutlass', 'carrack'])
    // Width share follows length: the same pad on every image keeps the ratio exact.
    expect(items.map((el) => Number(el.style.flexGrow))).toEqual([17.2, 37.5, 126])
    expect(within(items[2]).getByAltText('Carrack').getAttribute('src')).toBe('https://renders.scbridge.app/c4c4c4c4c4c4c4c4/2048.webp')
  })

  it('labels each ship with its name and length', () => {
    renderLineup()
    const carrack = screen.getAllByTestId('lineup-ship')[2]
    expect(within(carrack).getByText('Carrack')).toBeTruthy()
    expect(within(carrack).getByText('126 m')).toBeTruthy()
    expect(within(screen.getAllByTestId('lineup-ship')[0]).getByText('17.2 m')).toBeTruthy()
  })

  it('lists ships it cannot draw, and says why', () => {
    renderLineup()
    const missing = screen.getByTestId('lineup-missing')
    expect(within(missing).getByText(/C8 Pisces/)).toBeTruthy()
    expect(within(missing).getByText(/Concept Ship/)).toBeTruthy()
    expect(missing.textContent).toMatch(/no side view/i)
  })

  it('shows a prompt and draws nothing when no ships are picked', () => {
    renderLineup([])
    expect(screen.queryAllByTestId('lineup-ship')).toHaveLength(0)
    expect(screen.getByText(/pick ships/i)).toBeTruthy()
  })
})
