// Integer aUEC formatting — amounts are always whole numbers end-to-end.
export function formatAUEC(amount, { short } = {}) {
  // Normalize negative zero (e.g. `-data.liabilities` when liabilities is 0):
  // both `(-0).toLocaleString()` and the short path render "-0" otherwise.
  if (amount === 0) amount = 0
  if (short && Math.abs(amount) >= 1_000_000) {
    const millions = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${millions}M aUEC`
  }
  return `${amount.toLocaleString('en-US')} aUEC`
}

// Strict integer parser for money text inputs. HTML number inputs accept
// '1e5' (a valid float string) but parseInt('1e5', 10) === 1 — a preview and
// its posted body could silently diverge. Contract: digits with optional
// comma/space group separators and an optional leading minus, nothing else;
// anything off-contract (scientific notation, decimals, garbage, blank)
// returns null.
export function parseAUEC(value) {
  const cleaned = String(value).trim().replace(/[,\s]/g, '')
  return /^-?\d+$/.test(cleaned) ? parseInt(cleaned, 10) : null
}

export function signClass(amount) {
  if (amount > 0) return 'text-sc-success'
  if (amount < 0) return 'text-sc-danger'
  return 'text-gray-400'
}

export function toneBySign(amount) {
  if (amount > 0) return 'positive'
  if (amount < 0) return 'negative'
  return 'neutral'
}
