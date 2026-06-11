import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagPicker from './TagPicker'

describe('TagPicker', () => {
  it('running_cost shows all three default tags including Location invest', () => {
    render(<TagPicker category="running_cost" onPick={() => {}} onSkip={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: /^ship consumables$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^player consumables$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^location invest$/i })).toBeInTheDocument()
  })

  it('running_cost shows the note input', () => {
    render(<TagPicker category="running_cost" onPick={() => {}} onSkip={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText(/ship \/ player \/ location/i)).toBeInTheDocument()
  })

  it('trading does NOT show the note input', () => {
    render(<TagPicker category="trading" onPick={() => {}} onSkip={() => {}} onCancel={() => {}} />)
    expect(screen.queryByLabelText(/ship \/ player \/ location/i)).not.toBeInTheDocument()
  })

  it('financial does NOT show the note input', () => {
    render(<TagPicker category="financial" onPick={() => {}} onSkip={() => {}} onCancel={() => {}} />)
    expect(screen.queryByLabelText(/ship \/ player \/ location/i)).not.toBeInTheDocument()
  })

  it('picking a tag forwards the note to onPick', async () => {
    const onPick = vi.fn()
    render(<TagPicker category="running_cost" onPick={onPick} onSkip={() => {}} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/ship \/ player \/ location/i), 'Carrack')
    await userEvent.click(screen.getByRole('button', { name: /^ship consumables$/i }))
    expect(onPick).toHaveBeenCalledWith({ tag: 'ship_consumables', note: 'Carrack' })
  })

  it('"No tag" forwards the note to onSkip', async () => {
    const onSkip = vi.fn()
    render(<TagPicker category="running_cost" onPick={() => {}} onSkip={onSkip} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/ship \/ player \/ location/i), 'Jean-Luc')
    await userEvent.click(screen.getByRole('button', { name: /no tag/i }))
    expect(onSkip).toHaveBeenCalledWith({ note: 'Jean-Luc' })
  })

  it('trading tag pick does NOT pass a note argument', async () => {
    const onPick = vi.fn()
    render(<TagPicker category="trading" onPick={onPick} onSkip={() => {}} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^minerals$/i }))
    expect(onPick).toHaveBeenCalledWith({ tag: 'minerals', note: undefined })
  })

  it('Cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<TagPicker category="running_cost" onPick={() => {}} onSkip={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('trading shows "Player Trading" and "NPC Trading" buttons', () => {
    render(<TagPicker category="trading" onPick={() => {}} onSkip={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: /^player trading$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^npc trading$/i })).toBeInTheDocument()
  })

  it('picking "Player Trading" sends tag: player_trading with no note', async () => {
    const onPick = vi.fn()
    render(<TagPicker category="trading" onPick={onPick} onSkip={() => {}} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^player trading$/i }))
    expect(onPick).toHaveBeenCalledWith({ tag: 'player_trading', note: undefined })
  })

  it('picking "NPC Trading" sends tag: npc_trading with no note', async () => {
    const onPick = vi.fn()
    render(<TagPicker category="trading" onPick={onPick} onSkip={() => {}} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^npc trading$/i }))
    expect(onPick).toHaveBeenCalledWith({ tag: 'npc_trading', note: undefined })
  })
})
