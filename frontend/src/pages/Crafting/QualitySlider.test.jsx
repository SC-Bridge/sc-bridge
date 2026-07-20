import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QualitySlider, { snapValue } from './QualitySlider'

describe('QualitySlider', () => {
  it('snaps near a snap point', () => {
    expect(snapValue(248)).toBe(250)
    expect(snapValue(500)).toBe(500)
    expect(snapValue(123)).toBe(123)
  })
  it('renders the slot name + resource and reports changes', () => {
    const onChange = vi.fn()
    render(<QualitySlider slot={{ name: 'Barrel', resource_name: 'Iron', slot_type: 'resource' }} value={500} onChange={onChange} />)
    expect(screen.getByText('Barrel')).toBeInTheDocument()
    expect(screen.getByText('Iron')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '800' } })
    expect(onChange).toHaveBeenCalledWith(800)
  })
})
