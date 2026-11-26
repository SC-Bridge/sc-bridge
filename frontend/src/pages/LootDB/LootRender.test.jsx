import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LootRender from './LootRender'

const calls = vi.hoisted(() => [])

vi.mock('../../hooks/useRenderVariants', () => ({
  useRenderVariants: (kind, itemKey) => {
    calls.push([kind, itemKey])
    return {
      variants: [
        { variant: '', view: 'side', hash: 'r0', width: 2048, height: 1024, name: null },
        { variant: 'zzr_rifle_01_black02', view: 'side', hash: 'r1', width: 2048, height: 1024, name: 'Black' },
      ],
      loading: false,
      error: null,
    }
  },
}))

describe('LootRender', () => {
  it('opens a weapon finish on its base weapon with the finish selected', () => {
    const item = {
      render: { hash: 'r1', width: 2048, height: 1024, view: 'side' },
      render_variants_kind: 'fps_weapon',
      render_item_key: 'zzr_rifle_01',
      render_variant: 'zzr_rifle_01_black02',
    }
    render(<MemoryRouter><LootRender item={item} title="Zzr Rifle Black" /></MemoryRouter>)
    fireEvent.load(screen.getByAltText('Zzr Rifle Black'))
    fireEvent.click(screen.getByRole('button', { name: /Open large view of Zzr Rifle Black/ }))
    expect(calls).toContainEqual(['fps_weapon', 'zzr_rifle_01'])
    const main = screen.getByRole('dialog').querySelector('img[src$="/2048.webp"]')
    expect(main?.getAttribute('src')).toBe('https://renders.scbridge.app/r1/2048.webp')
  })
})
