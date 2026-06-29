import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SavedBuilds from './SavedBuilds'

describe('SavedBuilds', () => {
  const items = [{ id: 1, name: 'Daily Carry', weapon_uuid: 'w1', config: { qualities: { 0: 750 }, attachments: {} } }]

  it('lists saved builds and loads one', () => {
    const onLoad = vi.fn()
    render(<SavedBuilds items={items} onLoad={onLoad} onDelete={() => {}} onSave={() => {}} canSave />)
    fireEvent.click(screen.getByRole('button', { name: /Load/ }))
    expect(onLoad).toHaveBeenCalledWith(items[0])
  })

  it('saves the current build with a name', () => {
    const onSave = vi.fn()
    render(<SavedBuilds items={[]} onLoad={() => {}} onDelete={() => {}} onSave={onSave} canSave />)
    fireEvent.change(screen.getByPlaceholderText(/build name/i), { target: { value: 'My Build' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(onSave).toHaveBeenCalledWith('My Build')
  })

  it('disables save when canSave is false', () => {
    render(<SavedBuilds items={[]} onLoad={() => {}} onDelete={() => {}} onSave={() => {}} canSave={false} />)
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled()
  })
})
