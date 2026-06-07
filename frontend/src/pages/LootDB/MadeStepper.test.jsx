import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MadeStepper from './MadeStepper'

describe('MadeStepper (#90 — saved-build "Made N")', () => {
  it('at qty 0 shows a single "Made" affordance that sets qty to 1', async () => {
    const onSetQty = vi.fn()
    render(<MadeStepper qty={0} onSetQty={onSetQty} />)
    const btn = screen.getByRole('button', { name: /mark made/i })
    await userEvent.click(btn)
    expect(onSetQty).toHaveBeenCalledWith(1)
  })

  it('at qty > 0 shows the count and increments/decrements', async () => {
    const onSetQty = vi.fn()
    render(<MadeStepper qty={6} onSetQty={onSetQty} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /increase made count/i }))
    expect(onSetQty).toHaveBeenCalledWith(7)
    await userEvent.click(screen.getByRole('button', { name: /decrease made count/i }))
    expect(onSetQty).toHaveBeenCalledWith(5)
  })

  it('decrement from 1 unmarks (sets to 0)', async () => {
    const onSetQty = vi.fn()
    render(<MadeStepper qty={1} onSetQty={onSetQty} />)
    await userEvent.click(screen.getByRole('button', { name: /unmark made/i }))
    expect(onSetQty).toHaveBeenCalledWith(0)
  })
})
