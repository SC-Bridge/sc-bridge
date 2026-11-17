// Fallback palette for an account whose colour is null. Mirrors the API's
// `palette`; the colour picker itself uses the palette from GET /api/rsi-accounts.
export const ACCOUNT_COLORS = [
  '#22d3ee', '#f97316', '#a855f7', '#84cc16', '#f43f5e',
  '#eab308', '#3b82f6', '#10b981', '#ec4899', '#94a3b8',
]

export const accountName = (a) => a?.label || a?.rsi_handle || 'Imported hangar'

export const accountInitial = (a) => accountName(a).charAt(0).toUpperCase()

export const accountColor = (a, index = 0) =>
  a?.color || ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]

// Resolve the marker inputs for a row, or null when nothing should render
// (flag off / fewer than 2 accounts / row has no known account).
export function resolveAccountMarker(rsiAccountId, accounts) {
  if (!accounts || accounts.length < 2 || rsiAccountId == null) return null
  const index = accounts.findIndex((a) => a.id === rsiAccountId)
  if (index < 0) return null
  const account = accounts[index]
  return { account, name: accountName(account), initial: accountInitial(account), color: accountColor(account, index) }
}

// Inset left-edge stripe for the first cell of a table row (no markup needed).
export function accountStripeStyle(rsiAccountId, accounts) {
  const marker = resolveAccountMarker(rsiAccountId, accounts)
  return marker ? { boxShadow: `inset 4px 0 0 ${marker.color}` } : undefined
}

// "Analysing: Main, Alt" for an AI analysis row's account names; null means it
// covered every account.
export const analysingLabel = (names) =>
  `Analysing: ${names && names.length > 0 ? names.join(', ') : 'all accounts'}`

// The `accounts` value the AI analysis endpoint takes for a filter: 'all', a list
// of ids, or undefined (single-account users send nothing).
export function analysisAccountsValue(filter) {
  if (!filter?.active) return undefined
  return filter.isAll ? 'all' : [...filter.selectedIds].sort((a, b) => a - b)
}
