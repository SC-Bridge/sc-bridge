import { describe, it, expect } from 'vitest'
import { resolveWeaponIcon } from './weaponIcon'

describe('resolveWeaponIcon', () => {
  it('returns the real icon url when present', () => {
    expect(resolveWeaponIcon({ name: 'LH86 Pistol', icon_url: 'https://r2/lh86.webp' }))
      .toEqual({ url: 'https://r2/lh86.webp', placeholder: 'LH86 Pistol' })
  })
  it('falls back to the weapon name as placeholder text when no icon', () => {
    expect(resolveWeaponIcon({ name: 'A03 Sniper Rifle' }))
      .toEqual({ url: null, placeholder: 'A03 Sniper Rifle' })
  })
  it('tolerates a missing weapon', () => {
    expect(resolveWeaponIcon(null)).toEqual({ url: null, placeholder: 'Weapon' })
  })
})
