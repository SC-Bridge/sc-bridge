import React from 'react'
import { resolveAccountMarker } from '../lib/accounts'

/**
 * Colour marker naming the RSI account that owns a ship or hangar item.
 * `accounts` is the page's one /api/rsi-accounts list (fetched only when
 * features.multiAccount is on). Renders nothing unless the user has 2+ accounts.
 *
 * card: left-edge stripe + top-right initial avatar, absolutely positioned inside
 *   a `relative` parent.
 * row: same stripe; the avatar is an in-flow flex child, so render it as the
 *   row's LAST child.
 * cell: inline initial dot (table rows pair it with accountStripeStyle on the
 *   first cell).
 */
export default function AccountMarker({ rsiAccountId, accounts, variant = 'card' }) {
  const marker = resolveAccountMarker(rsiAccountId, accounts)
  if (!marker) return null
  const { name, initial, color } = marker
  const avatarStyle = { backgroundColor: color, color: '#0b1220' }

  if (variant === 'cell') {
    return (
      <span
        role="img"
        aria-label={name}
        title={name}
        style={avatarStyle}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
      >
        {initial}
      </span>
    )
  }

  // row: in-flow last flex child so it never overlaps right-aligned row content.
  const avatarPos = variant === 'row' ? 'shrink-0' : 'absolute top-2 right-2'
  return (
    <>
      <span
        data-testid="account-stripe"
        aria-hidden="true"
        style={{ backgroundColor: color }}
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
      />
      <span
        role="img"
        aria-label={name}
        title={name}
        style={avatarStyle}
        className={`${avatarPos} w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow`}
      >
        {initial}
      </span>
    </>
  )
}
