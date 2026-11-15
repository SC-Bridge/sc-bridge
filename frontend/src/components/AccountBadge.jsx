import React from 'react'
import { useRsiAccounts } from '../hooks/useAPI'
import { Pill } from '../pages/HangarCleanup/ui'

/**
 * Small owner tag for a ship or hangar item. Renders nothing unless the user
 * has more than one RSI account.
 */
export default function AccountBadge({ rsiAccountId }) {
  const { data } = useRsiAccounts()
  const accounts = data?.accounts
  if (!accounts || accounts.length < 2 || rsiAccountId == null) return null
  const account = accounts.find((a) => a.id === rsiAccountId)
  if (!account) return null
  return <Pill tone="info" title="RSI account">{account.label || account.rsi_handle || 'Imported hangar'}</Pill>
}
