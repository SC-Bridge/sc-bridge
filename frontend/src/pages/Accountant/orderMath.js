// Pure order display math — mirrors the backend formulas in
// src/routes/accountant/order-helpers.ts so previews match what the
// server will actually post. Math.round only, never floor (REAL quantities).
import { ORDER_TEMPLATE } from './constants'

// round(quantity × price_per_unit) — same as insertOrder's total.
export function orderTotal(quantity, pricePerUnit) {
  return Math.round(quantity * pricePerUnit)
}

// §5.3 — effective rate for the REMAINING quantity (order-helpers.ts effectiveRate).
// 'late' triggers strictly after deliver_by; 'partial' once anything is fulfilled.
export function effectiveRate(order, { occurredAtMs, fulfilledQty }) {
  const triggered =
    (order.rate_change_condition === 'late' && order.deliver_by !== null
      && occurredAtMs > new Date(order.deliver_by).getTime())
    || (order.rate_change_condition === 'partial' && fulfilledQty > 0)
  return triggered ? order.price_per_unit * (1 + order.rate_change_pct / 100) : order.price_per_unit
}

// round(qty × effective rate) — the fulfilment amount the server will book.
export function fulfillmentPreview(quantity, rate) {
  return Math.round(quantity * rate)
}

// Contract keys whose value deviates from ORDER_TEMPLATE — drives the
// "← modified" markers (mirror of order-helpers.ts modifiedFields).
export function modifiedContractFields(contract) {
  return Object.keys(ORDER_TEMPLATE).filter(
    (k) => (contract[k] ?? null) !== ORDER_TEMPLATE[k],
  )
}

// Display refs: orders are plain O-{id}; workorders zero-pad like the
// backend's printf('%04d') summary text.
export function orderRef(id) {
  return `O-${id}`
}

export function woRef(id) {
  return `W-${String(id).padStart(4, '0')}`
}
