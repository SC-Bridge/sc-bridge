// Integer aUEC formatting — amounts are always whole numbers end-to-end.
export function formatAUEC(amount, { short } = {}) {
  if (short && Math.abs(amount) >= 1_000_000) {
    const millions = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${millions}M aUEC`
  }
  return `${amount.toLocaleString('en-US')} aUEC`
}

export function signClass(amount) {
  if (amount > 0) return 'text-sc-success'
  if (amount < 0) return 'text-sc-danger'
  return 'text-gray-400'
}
