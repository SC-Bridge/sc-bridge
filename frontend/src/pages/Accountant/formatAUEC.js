// Integer aUEC formatting — amounts are always whole numbers end-to-end.
export function formatAUEC(amount) {
  return `${amount.toLocaleString('en-US')} aUEC`
}

export function signClass(amount) {
  if (amount > 0) return 'text-sc-success'
  if (amount < 0) return 'text-sc-danger'
  return 'text-gray-400'
}
