import React from 'react'
import { Pill } from '../pages/HangarCleanup/ui'

/**
 * Small owner tag for a ship or hangar item. `accounts` is the page's one
 * /api/rsi-accounts list (fetched only when features.multiAccount is on).
 * Renders nothing unless the user has more than one RSI account.
 */
export default function AccountBadge({ rsiAccountId, accounts }) {
  if (!accounts || accounts.length < 2 || rsiAccountId == null) return null
  const account = accounts.find((a) => a.id === rsiAccountId)
  if (!account) return null
  return <Pill tone="info" title="RSI account">{account.label || account.rsi_handle || 'Imported hangar'}</Pill>
}
