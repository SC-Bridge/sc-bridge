/**
 * Resolve which model should be active given the LIVE model list and the
 * user's saved choice. Robust to lists of any length/order (the model list is
 * now fetched live, not hardcoded).
 *
 * - keep the saved model if the provider still offers it
 * - otherwise fall back to the first model in the list
 * - null when there are no models
 */
export function resolveActiveModel(models, selected) {
  if (!Array.isArray(models) || models.length === 0) return null
  if (selected && models.some((m) => m.id === selected)) return selected
  return models[0].id
}
