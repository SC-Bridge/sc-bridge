import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MassSlider from './MassSlider'

const baseProps = {
  min: 0,
  max: 10000,
  step: 50,
  defaultValue: 1000,
  label: 'Rock Mass',
  unit: 'kg',
}

describe('MassSlider', () => {
  it('fires onChange live when the slider moves', () => {
    const onChange = vi.fn()
    render(<MassSlider {...baseProps} value={1000} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2500' } })
    expect(onChange).toHaveBeenCalledWith(2500)
  })

  it('commits typed text on Enter', () => {
    const onChange = vi.fn()
    render(<MassSlider {...baseProps} value={1000} onChange={onChange} />)
    const box = screen.getByRole('textbox')
    box.focus()
    fireEvent.change(box, { target: { value: '9000' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(9000)
  })

  it('clamps a committed value above max down to max', () => {
    const onChange = vi.fn()
    render(<MassSlider {...baseProps} value={1000} onChange={onChange} />)
    const box = screen.getByRole('textbox')
    box.focus()
    fireEvent.change(box, { target: { value: '999999' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(10000)
  })

  it('reverts silently on invalid text without firing onChange', () => {
    const onChange = vi.fn()
    render(<MassSlider {...baseProps} value={1000} onChange={onChange} />)
    const box = screen.getByRole('textbox')
    box.focus()
    fireEvent.change(box, { target: { value: 'abc' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(box).toHaveValue('1000')
  })

  it('shows the prop value in the box when not editing', () => {
    render(<MassSlider {...baseProps} value={3200} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('3200')
  })

  // Tabbing between adjacent controls must not wade through the invisible
  // range input or the reset button — those stay mouse-operable but skip
  // out of the tab order (the QualitySlider lesson).
  it('keeps only the number entry in the tab order', () => {
    const { container } = render(<MassSlider {...baseProps} value={1000} onChange={() => {}} />)
    const numberInput = screen.getByRole('textbox')
    expect(numberInput).not.toHaveAttribute('tabIndex', '-1')

    const rangeInput = container.querySelector('input[type="range"]')
    expect(rangeInput).toHaveAttribute('tabIndex', '-1')

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((button) => expect(button).toHaveAttribute('tabIndex', '-1'))
  })
})
