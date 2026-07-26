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

  // Tabbing from one material's number entry to the next must not wade through
  // the invisible range input, the snap-point markers, or the 0/1000 shortcuts —
  // those stay mouse-operable but skip out of the tab order.
  it('keeps only the number entry in the tab order', () => {
    const { container } = render(
      <QualitySlider slot={{ name: 'Barrel', resource_name: 'Iron', slot_type: 'resource' }} value={500} onChange={() => {}} />,
    )
    const numberInput = screen.getByRole('textbox')
    expect(numberInput).not.toHaveAttribute('tabIndex', '-1')

    const rangeInput = container.querySelector('input[type="range"]')
    expect(rangeInput).toHaveAttribute('tabIndex', '-1')

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((button) => expect(button).toHaveAttribute('tabIndex', '-1'))
  })
})
