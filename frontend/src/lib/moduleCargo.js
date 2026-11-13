// Cargo for modular ships.
//
// `ship.cargo` (vehicles.cargo) is the hull as it ships: the bare hull plus
// whatever modules are fitted by default — the extraction walks into the
// default module's own loadout. Each module row carries its own `cargo` (SCU of
// the grids inside it, null when it has none). So swapping a module changes the
// total by (equipped - default) on that port; adding the equipped module on top
// of the hull would double-count a default module that carries cargo.

function byPort(modules) {
  const ports = new Map()
  for (const m of modules || []) {
    const port = m.port_name || 'Default'
    if (!ports.has(port)) ports.set(port, [])
    ports.get(port).push(m)
  }
  return ports
}

const scu = (m) => m?.cargo || 0

/** SCU change from the stock ship for the given selections (port_name → module uuid). */
export function moduleCargoDelta(modules, selections) {
  let delta = 0
  for (const [port, list] of byPort(modules)) {
    const def = list.find(m => m.is_default)
    const chosen = list.find(m => m.uuid === selections?.[port]) || def
    delta += scu(chosen) - scu(def)
  }
  return delta
}

/**
 * Total cargo SCU with the selected modules fitted, or null when neither the
 * hull nor an equipped module has a cargo grid (the UI shows a dash).
 */
export function totalCargo(hullCargo, modules, selections) {
  const total = (hullCargo || 0) + moduleCargoDelta(modules, selections)
  return total > 0 ? total : null
}

/** The most cargo any module combination gives (best module on every port). */
export function maxCargo(hullCargo, modules) {
  const best = {}
  for (const [port, list] of byPort(modules)) {
    const top = list.reduce((a, b) => (scu(b) > scu(a) ? b : a))
    best[port] = top.uuid
  }
  return totalCargo(hullCargo, modules, best)
}
