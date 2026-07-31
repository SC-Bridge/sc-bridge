import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RockCalculator, { clampMassToScope } from './RockCalculator'

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
// A laser with one module slot + the Rieger MK3's real 4.9 damage multiplier
// (1.25) — the Rieger series exists specifically to raise laser power.
const LASER_MODULAR = { id: 2, size: 1, name: 'Modular Laser', beam_dps: 2000, module_slots: 1 }
const MODULE_RIEGER = { id: 10, name: 'Rieger MK3', type: 'passive', damage_multiplier: 1.25 }
// Klein S1's real 4.9 resistanceModifier (-45%) — the sought-after upgrade.
const LASER_KLEIN = { id: 3, size: 1, name: 'Klein S1', beam_dps: 2000, module_slots: 0, mod_resistance: -0.45 }
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

// Helix S1's real 4.9 resistanceModifier (-30%).
const LASER_HELIX = { id: 4, size: 1, name: 'Helix S1', beam_dps: 2000, module_slots: 0, mod_resistance: -0.3 }

// The generic C-Type asteroid (`asteroid_ctype`) worked example from
// tools/docs/superpowers/specs/
// 2026-07-30-mining-resistance-composition-findings.md §6 — rockResistance
// 0.2408 renormalised, which is what makes an 8000-mass rock genuinely
// marginal for a single S1 laser.
const C_TYPE_PARTS = [
  { element: 'aluminium', min_pct: 50, max_pct: 50, probability: 0.85 },
  { element: 'hephaestanite', min_pct: 45, max_pct: 45, probability: 0.6 },
  { element: 'taranite', min_pct: 35, max_pct: 35, probability: 0.3 },
  { element: 'bexalite', min_pct: 35, max_pct: 35, probability: 0.3 },
  { element: 'gold', min_pct: 35, max_pct: 35, probability: 0.07 },
  { element: 'quantainium', min_pct: 35, max_pct: 35, probability: 0.05 },
]
const C_TYPE_ELEMENT_ROWS = [
  { class_name: 'aluminium', resistance: -0.4, instability: 0 },
  { class_name: 'hephaestanite', resistance: -0.3, instability: 0 },
  { class_name: 'taranite', resistance: 0.5, instability: 0 },
  { class_name: 'bexalite', resistance: 0.6, instability: 0 },
  { class_name: 'gold', resistance: 0.5, instability: 0 },
  { class_name: 'quantainium', resistance: 0.95, instability: 0 },
]
const C_TYPE_COMPOSITION = { ...COMPOSITION, composition_json: JSON.stringify(C_TYPE_PARTS) }

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

function cTypeData(overrides = {}) {
  return baseData({ compositions: [C_TYPE_COMPOSITION], elements: C_TYPE_ELEMENT_ROWS, ...overrides })
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
function selectLaser(optionText = /Test Laser \(S1\)/) {
  const laserField = screen.getByText('S1 Laser').parentElement
  fireEvent.click(within(laserField).getByRole('button'))
  fireEvent.click(screen.getByText(optionText))
}

function selectRock() {
  fireEvent.click(screen.getByText('Select a rock you scanned...'))
  fireEvent.click(screen.getByText('Test Deposit'))
}

function selectModule(slotLabel, optionText) {
  const field = screen.getByText(slotLabel).parentElement
  fireEvent.click(within(field).getByRole('button'))
  fireEvent.click(screen.getByText(optionText))
}

function selectLaserAndRock() {
  selectLaser()
  selectRock()
}

function massBox() {
  const label = screen.getByText('Rock Mass (scan HUD)')
  return within(label.parentElement).getByRole('textbox')
}

describe('RockCalculator — rock mass crack feasibility', () => {
  it('does not render the mass card before a rock + laser are selected', () => {
    renderCalculator(baseData())
    expect(screen.queryByText('Rock Mass (scan HUD)')).not.toBeInTheDocument()
  })

  it('keeps the slider visible but hides the verdict row when the scope has no global params loaded', () => {
    renderCalculator(baseData({ global_params: [] }))
    selectLaserAndRock()
    // computeCrackFeasibility({ globalParams: null }) returns null -- the OUTPUT
    // row (verdict/time/margin) is inert, but the slider itself must stay
    // rendered: it's the only control that could ever recover a null result.
    expect(screen.getByText('Rock Mass (scan HUD)')).toBeInTheDocument()
    expect(screen.queryByText('CAN CRACK')).not.toBeInTheDocument()
    expect(screen.queryByText('CANNOT CRACK')).not.toBeInTheDocument()
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

  it('mass=0 is a recoverable dead zone, not a self-inflicted trap', () => {
    renderCalculator(baseData())
    selectLaserAndRock()

    const box = massBox()
    box.focus()
    fireEvent.change(box, { target: { value: '0' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    // computeCrackFeasibility guards on !(mass > 0) -> null -- verdict row hides...
    expect(screen.queryByText('CAN CRACK')).not.toBeInTheDocument()
    expect(screen.queryByText('CANNOT CRACK')).not.toBeInTheDocument()
    // ...but the slider (the only way to set mass back to something positive)
    // must still be on screen, not vanish along with the verdict.
    expect(screen.getByText('Rock Mass (scan HUD)')).toBeInTheDocument()
    expect(massBox()).toHaveValue('0')

    // Recovery: raising mass again brings the verdict row back.
    const box2 = massBox()
    box2.focus()
    fireEvent.change(box2, { target: { value: '8000' } })
    fireEvent.keyDown(box2, { key: 'Enter' })
    expect(screen.getByText('CAN CRACK')).toBeInTheDocument()
  })
})

// Total DPS is Σ_lasers (beam_dps × Π_modules damage_multiplier) — see the
// resistance-composition findings doc §7.2. Ignoring damage_multiplier
// understated a Rieger MK3 loadout by 25% and overstated a Focus MK1 by 18%.
describe('RockCalculator — module damage multipliers in total DPS', () => {
  it('multiplies laser DPS by an installed module damage multiplier', () => {
    renderCalculator(baseData({ lasers: [LASER_MODULAR], modules: [MODULE_RIEGER] }))
    selectLaser(/Modular Laser \(S1\)/)
    selectModule('Module 1', 'Rieger MK3')
    selectRock()

    // 2000 × 1.25 = 2500 effective DPS; mass 8000 → decay 1600, netRate 900,
    // capacity 80000 → 88.9s, margin 900/1600 = 56.25%.
    expect(screen.getByText('~1m 29s best case')).toBeInTheDocument()
    expect(screen.getByText('+56% power margin')).toBeInTheDocument()
  })

  it('leaves DPS untouched when no module is installed', () => {
    renderCalculator(baseData({ lasers: [LASER_MODULAR], modules: [MODULE_RIEGER] }))
    selectLaser(/Modular Laser \(S1\)/)
    selectRock()

    // Bare 2000 DPS: netRate 400 → 200s, margin 25%.
    expect(screen.getByText('~3m 20s best case')).toBeInTheDocument()
    expect(screen.getByText('+25% power margin')).toBeInTheDocument()
  })
})

// The crack verdict is fed resistance-adjusted DPS:
//   effectiveDPS = totalDps × (1 - clamp(rockResistance × (1 + Σmod), 0, 0.95))
// Goldens below are the findings doc §6 table for asteroid_ctype at 2000 base
// DPS / 8000 mass / ship scope (capacity 80000, decay 1600).
describe('RockCalculator — resistance-adjusted crack verdict', () => {
  it('a bare 2000 DPS laser CANNOT crack an 8000-mass C-Type asteroid', () => {
    renderCalculator(cTypeData())
    selectLaserAndRock()

    // damageFactor 0.7592 → 1518.3 effective DPS vs 1600 decay → net -81.7.
    expect(screen.getByText('CANNOT CRACK')).toBeInTheDocument()
    expect(screen.getByText('-5% power margin')).toBeInTheDocument()
    expect(screen.queryByText(/best case/)).not.toBeInTheDocument()
  })

  it('Helix S1 (-30% resistance) turns the same rock into a slow crack', () => {
    renderCalculator(cTypeData({ lasers: [LASER_HELIX] }))
    selectLaser(/Helix S1 \(S1\)/)
    selectRock()

    // effectiveResistance 0.1686 → 1662.8 DPS → net 62.8 → 80000/62.8 = 1273.6s
    expect(screen.getByText('CAN CRACK')).toBeInTheDocument()
    expect(screen.getByText('~21m 14s best case')).toBeInTheDocument()
    expect(screen.getByText('+4% power margin')).toBeInTheDocument()
  })

  it('Klein S1 (-45% resistance) cracks it in half the time', () => {
    renderCalculator(cTypeData({ lasers: [LASER_KLEIN] }))
    selectLaser(/Klein S1 \(S1\)/)
    selectRock()

    // effectiveResistance 0.1325 → 1735.1 DPS → net 135.1 → 592.3s
    expect(screen.getByText('CAN CRACK')).toBeInTheDocument()
    expect(screen.getByText('~9m 52s best case')).toBeInTheDocument()
    expect(screen.getByText('+8% power margin')).toBeInTheDocument()
  })

  it('is the page\'s only crack verdict — the CAN/CANNOT BREAK banner is gone', () => {
    // The old banner compared DPS against laser_damage_full_value × curve
    // factor, a rock-surface damage-map normaliser with no fracture meaning
    // (findings §2). Replaced outright rather than shown alongside.
    renderCalculator(cTypeData())
    selectLaserAndRock()

    expect(screen.queryByText('CAN BREAK')).not.toBeInTheDocument()
    expect(screen.queryByText('CANNOT BREAK')).not.toBeInTheDocument()
    expect(screen.getByText('CANNOT CRACK')).toBeInTheDocument()
  })

  it('keeps the multi-variant caveat that used to sit in the banner', () => {
    const variant = { ...C_TYPE_COMPOSITION, uuid: 'comp-2', class_name: 'Asteroid_CType_Tin', name: 'Asteroid_CType_Tin' }
    renderCalculator(cTypeData({
      compositions: [C_TYPE_COMPOSITION, variant],
      rock_entities: [ROCK_ENTITY, { ...ROCK_ENTITY, composition_uuid: 'comp-2' }],
    }))
    selectLaserAndRock()

    expect(screen.getByText(/Showing average across 2 variants/)).toBeInTheDocument()
  })

  it('labels mass with no unit noun — the scan HUD number is unitless', () => {
    renderCalculator(cTypeData())
    selectLaserAndRock()

    // One label, no unit suffix: the scan HUD prints a bare number, and the
    // old 'kg' invented a unit the game never states.
    expect(screen.queryByText('kg')).not.toBeInTheDocument()
    expect(screen.getByText('Rock Mass (scan HUD)')).toBeInTheDocument()
    expect(screen.queryByText('Mass (scan HUD)')).not.toBeInTheDocument()
  })

  it('has retired the Power vs Rock bar — the crack card is the only feasibility read', () => {
    // PowerBar measured DPS against laser_damage_full_value, the same
    // damage-map normaliser that retired the banner (findings §2), so it
    // could read "Deficit" directly above a "CAN CRACK" verdict.
    renderCalculator(cTypeData({ lasers: [LASER_KLEIN] }))
    selectLaser(/Klein S1 \(S1\)/)
    selectRock()

    expect(screen.queryByText('Power vs Rock')).not.toBeInTheDocument()
    expect(screen.queryByText(/Surplus|Deficit/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Your power/)).not.toBeInTheDocument()
    expect(screen.getByText('CAN CRACK')).toBeInTheDocument()
  })

  it('does not colour a dead-even power margin green', () => {
    renderCalculator(baseData()) // no elements → rockResistance 0 → 2000 DPS
    selectLaserAndRock()

    const box = massBox()
    box.focus()
    fireEvent.change(box, { target: { value: '10000' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    // decay 2000 == DPS 2000 → netRate 0 → the pool never fills.
    expect(screen.getByText('CANNOT CRACK')).toBeInTheDocument()
    expect(screen.getByText('0% power margin')).toHaveClass('text-red-400')
  })
})

// Mass is scope-scaled (ship 0–40000, fps 0–10, ground_vehicle 0–2000), so a
// scope swap must not strand a ship-sized mass in an fps-sized range.
describe('clampMassToScope', () => {
  it('keeps a mass the new scope can represent', () => {
    expect(clampMassToScope(5, { min: 0, max: 10, default: 1 })).toBe(5)
  })

  it('falls back to the new scope default when the mass is out of range', () => {
    expect(clampMassToScope(8000, { min: 0, max: 10, default: 1 })).toBe(1)
    expect(clampMassToScope(-5, { min: 0, max: 10, default: 1 })).toBe(1)
  })

  it('falls back when the mass is not a number', () => {
    expect(clampMassToScope(undefined, { min: 0, max: 40000, default: 8000 })).toBe(8000)
  })
})

// mod_resistance is a CIG FloatModifierMultiplicative: negative = the rock
// fights back less = better laser (findings §7.1). The bonuses panel must
// colour a negative resistance modifier green, not red.
describe('RockCalculator — resistance modifier direction', () => {
  it('colours a resistance-reducing laser (Klein -45%) as a bonus, not a penalty', () => {
    renderCalculator(baseData({ lasers: [LASER_KLEIN] }))
    selectLaser(/Klein S1 \(S1\)/)
    selectRock()

    expect(screen.getByText('-45%')).toHaveClass('text-emerald-400')
  })
})
