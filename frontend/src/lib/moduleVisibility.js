// Which vehicle_modules rows are shown to the user.
//
// The extraction also emits rows that are not fittable options: generic
// template entities (AEGS_Retaliator_Module_Front, RSI_Galaxy_Module) and
// unreleased modules (RSI_Galaxy_Module_Crafting / _Refinery). They have no
// display_name, so that is the test. The one exception is a port's default:
// it is what the ship is fitted with, so it stays and is labelled from its
// class name rather than leaving the port with nothing installed.

const hasName = (m) => typeof m?.display_name === 'string' && m.display_name.trim() !== ''

/** Modules worth listing: named ones, plus a port's default even when unnamed. */
export function visibleModules(modules) {
  return (modules || []).filter(m => hasName(m) || !!m.is_default)
}

/** Label for a module row; falls back to the class name for an unnamed default. */
export function moduleLabel(m) {
  if (hasName(m)) return m.display_name
  return (m?.class_name || 'Unnamed module').replace(/_/g, ' ')
}

/**
 * Selections (port_name → module uuid) restricted to modules that are shown on
 * that port. A saved choice pointing at a hidden or removed module is dropped,
 * so the port falls back to its default everywhere the selections are used.
 */
export function visibleSelections(modules, selections) {
  if (!selections) return selections
  const shown = new Set(visibleModules(modules).map(m => `${m.port_name || 'Default'}\n${m.uuid}`))
  const out = {}
  for (const [port, uuid] of Object.entries(selections)) {
    if (shown.has(`${port}\n${uuid}`)) out[port] = uuid
  }
  return out
}
