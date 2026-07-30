import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RockCalculator from './RockCalculator'

vi.mock('../../lib/auth-client', () => ({
  useSession: () => ({ data: null }),
}))

vi.mock('../../hooks/useAPI', () => ({
  usePreferences: () => ({ data: null }),
  setPreferences: () => Promise.resolve({ ok: true }),
}))

// Ship-scope golden fixture — power_capacity_per_mass=10, decay_per_mass=0.2
// mirrors the golden values in computeCrackFeasibility.test.js so the
// expected canCrack/timeToCrack/marginPct numbers below are cross-checked
// against that module's own test suite, not just this integration test.
const LASER = { id: 1, size: 1, name: 'Test Laser', beam_dps: 2000, module_slots: 0 }
const COMPOSITION = {
  uuid: 'comp-1',
  name: 'Asteroid_CType_Iron',
  class_name: 'Asteroid_CType_Iron',
  rock_type: 'asteroid_ship',
  composition_json: '[]',
  deposit_name: 'Test Deposit',
}
const ROCK_ENTITY = {
  composition_uuid: 'comp-1',
  rock_category: 'ship_asteroid',
  laser_damage_full_value: 500,
}
const SHIP_GLOBAL_PARAMS = { scope: 'ship', power_capacity_per_mass: 10, decay_per_mass: 0.2, optimal_window_size: 0.1 }

function baseData(overrides = {}) {
  return {
    lasers: [LASER],
    modules: [],
    gadgets: [],
    compositions: [COMPOSITION],
    elements: [],
    rock_entities: [ROCK_ENTITY],
    global_params: [SHIP_GLOBAL_PARAMS],
    ...overrides,
  }
}

function renderCalculator(data) {
  return render(
    <MemoryRouter>
      <RockCalculator data={data} />
    </MemoryRouter>,
  )
}

// Select the Prospector's S1 laser slot, then the deposit — this is what
// "hasResults" (loadout + rock picked) requires before any result panel,
// including the mass card, renders. The laser dropdown's trigger button
// reads "None" (not the `placeholder` prop) because CustomSelect resolves
// `options.find(o => o.value === value)` against the '' value first — an
// existing quirk, not something this task touches — so open it by its
// "S1 Laser" field label instead of trigger text.
function selectLaserAndRock() {
  const laserField = screen.getByText('S1 Laser').parentElement
  fireEvent.click(within(laserField).getByRole('button'))
  fireEvent.click(screen.getByText(/Test Laser \(S1\)/))

  fireEvent.click(screen.getByText('Select a rock you scanned...'))
  fireEvent.click(screen.getByText('Test Deposit'))
}

function massBox() {
  const label = screen.getByText('Rock Mass')
  return within(label.parentElement).getByRole('textbox')
}

describe('RockCalculator — rock mass crack feasibility', () => {
  it('does not render the mass card before a rock + laser are selected', () => {
    renderCalculator(baseData())
    expect(screen.queryByText('Rock Mass')).not.toBeInTheDocument()
  })

  it('stays inert (no mass card) when the scope has no global params loaded', () => {
    renderCalculator(baseData({ global_params: [] }))
    selectLaserAndRock()
    expect(screen.queryByText('Rock Mass')).not.toBeInTheDocument()
  })

  it('defaults to the ship scope mass (8000) and renders CAN CRACK per the golden math', () => {
    renderCalculator(baseData())
    selectLaserAndRock()

    expect(massBox()).toHaveValue('8000')
    expect(screen.getByText('CAN CRACK')).toBeInTheDocument()
    // mass 8000, effectiveDPS 2000 -> capacity 80000, decay 1600, netRate 400,
    // timeToCrack 200s ("3m 20s"), marginPct 25 (matches computeCrackFeasibility.test.js)
    expect(screen.getByText('~3m 20s best case')).toBeInTheDocument()
    expect(screen.getByText('+25% power margin')).toBeInTheDocument()
  })

  it('flips to CANNOT CRACK and hides best-case time once mass pushes decay past effective DPS', () => {
    renderCalculator(baseData())
    selectLaserAndRock()

    const box = massBox()
    box.focus()
    fireEvent.change(box, { target: { value: '20000' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    // mass 20000 -> decay 4000 > effectiveDPS 2000 -> canCrack=false
    expect(screen.getByText('CANNOT CRACK')).toBeInTheDocument()
    expect(screen.queryByText(/best case/)).not.toBeInTheDocument()
    // netRate -2000, marginPct -50 -- signed, no leading '+' for a negative value
    expect(screen.getByText('-50% power margin')).toBeInTheDocument()
  })
})
