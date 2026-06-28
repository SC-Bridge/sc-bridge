// Real R2 icons land in plan A. Until then, url is null and the UI shows placeholder text.
export function resolveWeaponIcon(weapon) {
  return { url: weapon?.icon_url || null, placeholder: weapon?.name || 'Weapon' }
}
