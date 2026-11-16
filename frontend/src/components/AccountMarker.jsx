import React from 'react'
import { resolveAccountMarker } from '../lib/accounts'

/**
 * Colour marker naming the RSI account that owns a ship or hangar item.
 * `accounts` is the page's one /api/rsi-accounts list (fetched only when
 * features.multiAccount is on). Renders nothing unless the user has 2+ accounts.
 *
 * card: left-edge stripe (absolute, needs a `relative` parent) + a centred
 *   name band in-flow at the bottom, so render it as the card's LAST child.
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

  // z-10: card images scale on hover, and a transformed image paints over
  // earlier positioned siblings — it would hide the stripe.
  const stripe = (
    <span
      data-testid="account-stripe"
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className="absolute left-0 top-0 bottom-0 w-1 rounded-l z-10"
    />
  )

  // card: stripe + a full-width name band, so names that share a first letter
  // (Mr_Xul / Ms_Gia) stay distinct. In-flow — render it as the card's LAST child.
  if (variant === 'card') {
    return (
      <>
        {stripe}
        <div
          data-testid="account-band"
          title={name}
          style={avatarStyle}
          className="px-2 py-0.5 text-center text-[11px] font-semibold truncate"
        >
          {name}
        </div>
      </>
    )
  }

  // row: in-flow last flex child so it never overlaps right-aligned row content.
  return (
    <>
      {stripe}
      <span
        role="img"
        aria-label={name}
        title={name}
        style={avatarStyle}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow"
      >
        {initial}
      </span>
    </>
  )
}
