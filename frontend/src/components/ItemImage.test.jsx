import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ItemImage from './ItemImage'
import ShipImage from './ShipImage'

const R = { hash: 'abc', width: 512, height: 512, view: 'front' }
const RENDER_512 = 'https://renders.scbridge.app/abc/512.webp'

describe('ItemImage', () => {
  it('tries the render first, then src, then the placeholder', () => {
    const { container } = render(<ItemImage render={R} src="https://x/src.jpg" alt="Thing" />)
    const img = () => container.querySelector('img')
    expect(img().getAttribute('src')).toBe(RENDER_512)
    fireEvent.error(img())
    expect(img().getAttribute('src')).toBe('https://x/src.jpg')
    fireEvent.error(img())
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('No image yet')).toBeInTheDocument()
  })

  it('uses the 2048 render when size is 2048', () => {
    const { container } = render(<ItemImage render={R} size={2048} alt="Thing" />)
    expect(container.querySelector('img').getAttribute('src')).toBe('https://renders.scbridge.app/abc/2048.webp')
  })

  it('shows the placeholder immediately with no render and no src', () => {
    const { container } = render(<ItemImage render={null} src={null} alt="Thing" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('No image yet')).toBeInTheDocument()
  })

  it('has a square row size whose placeholder keeps the size and shows no text', () => {
    const { container } = render(<ItemImage render={null} src={null} alt="Thing" aspectRatio="row" />)
    const box = container.firstChild
    expect(box.className).toMatch(/\bw-10\b/)
    expect(box.className).toMatch(/\bh-10\b/)
    expect(screen.queryByText('No image yet')).toBeNull()
    expect(screen.getByRole('img', { name: /Thing — image unavailable/ })).toBeInTheDocument()
  })

  it('opens from a row-size render once loaded', () => {
    const onOpen = vi.fn()
    const { container } = render(<ItemImage render={R} alt="Thing" aspectRatio="row" onOpen={onOpen} />)
    fireEvent.load(container.querySelector('img'))
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Thing/ }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('uses the no-model placeholder text', () => {
    render(<ItemImage render={null} src={null} alt="Thing" placeholder="no-model" />)
    expect(screen.getByText('No image in game data')).toBeInTheDocument()
  })

  it('uses object-contain for renders and object-cover for other images', () => {
    const a = render(<ItemImage render={R} alt="Thing" />)
    expect(a.container.querySelector('img').className).toContain('object-contain')
    a.unmount()
    const b = render(<ItemImage src="https://x/src.jpg" alt="Thing" />)
    expect(b.container.querySelector('img').className).toContain('object-cover')
  })

  it('calls onOpen from a button once the render has loaded', () => {
    const onOpen = vi.fn()
    const { container } = render(<ItemImage render={R} alt="Thing" onOpen={onOpen} />)
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.load(container.querySelector('img'))
    fireEvent.click(screen.getByRole('button', { name: 'Open large view of Thing' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('renders no button without onOpen', () => {
    const { container } = render(<ItemImage render={R} alt="Thing" />)
    fireEvent.load(container.querySelector('img'))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the variant banner only when it fell through to baseSrc', () => {
    const { container } = render(<ItemImage src="https://x/v.jpg" baseSrc="https://x/b.jpg" alt="Thing" />)
    fireEvent.error(container.querySelector('img'))
    fireEvent.load(container.querySelector('img'))
    expect(screen.getByText('Variant image unavailable')).toBeInTheDocument()
  })
})

describe('ItemImage source changes', () => {
  it('resets to loading with the new render after a total error', () => {
    const { container, rerender } = render(<ItemImage render={R} alt="Thing" />)
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('No image yet')).toBeInTheDocument()
    rerender(<ItemImage render={{ ...R, hash: 'def' }} alt="Thing" />)
    const img = container.querySelector('img')
    expect(img.getAttribute('src')).toBe('https://renders.scbridge.app/def/512.webp')
    expect(img.className).toContain('opacity-0')
    expect(screen.queryByText('No image yet')).toBeNull()
  })

  it('resets to loading with the new src after a total error', () => {
    const { container, rerender } = render(<ItemImage src="https://x/a.jpg" alt="Thing" />)
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('No image yet')).toBeInTheDocument()
    rerender(<ItemImage src="https://x/b.jpg" alt="Thing" />)
    const img = container.querySelector('img')
    expect(img.getAttribute('src')).toBe('https://x/b.jpg')
    expect(img.className).toContain('opacity-0')
  })

  it('drops a stale loaded state when the source changes', () => {
    const { container, rerender } = render(<ItemImage src="https://x/a.jpg" alt="Thing" />)
    fireEvent.load(container.querySelector('img'))
    expect(container.querySelector('img').className).toContain('opacity-100')
    rerender(<ItemImage src="https://x/b.jpg" alt="Thing" />)
    expect(container.querySelector('img').className).toContain('opacity-0')
  })
})

describe('ShipImage wrapper', () => {
  it('keeps the Rocket placeholder and variant banner without a render', () => {
    const { container } = render(<ShipImage src="https://x/v.jpg" baseSrc="https://x/b.jpg" alt="Ship" />)
    fireEvent.error(container.querySelector('img'))
    fireEvent.load(container.querySelector('img'))
    expect(screen.getByText('Variant image unavailable')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows the Rocket icon placeholder on total failure', () => {
    const { container } = render(<ShipImage src={null} alt="Ship" />)
    expect(screen.getByRole('img', { name: 'Ship — image unavailable' })).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('No image yet')).toBeNull()
  })

  it('prefers the render when given', () => {
    const { container } = render(<ShipImage render={R} src="https://x/s.jpg" alt="Ship" />)
    expect(container.querySelector('img').getAttribute('src')).toBe(RENDER_512)
  })
})
