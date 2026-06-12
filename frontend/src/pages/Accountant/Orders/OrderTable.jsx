import { CATEGORY_LABELS, ORDER_TYPES, STATUS_LABELS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import { orderRef } from '../orderMath'

const TYPE_LABELS = Object.fromEntries(ORDER_TYPES.map(({ value, label }) => [value, label]))

export default function OrderTable({ orders, onSelect }) {
  return (
    <table className="w-full text-sm" data-testid="order-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-sc-border">
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Type</th>
          <th className="py-2 pr-3">Item</th>
          <th className="py-2 pr-3">Category</th>
          <th className="py-2 pr-3">Publisher</th>
          <th className="py-2 pr-3 text-right">Qty</th>
          <th className="py-2 pr-3 text-right">Price</th>
          <th className="py-2 pr-3 text-right">Total</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          // Purchases are money out — display sign matches the UX thumbnail.
          const signedTotal = o.type === 'purchase' ? -o.total : o.total
          return (
            <tr key={o.id}
              onClick={() => onSelect(o.id)}
              className="border-b border-sc-border/40 hover:bg-white/5 cursor-pointer">
              <td className="py-2 pr-3 text-gray-400">{orderRef(o.id)}</td>
              <td className="py-2 pr-3 text-gray-300">{TYPE_LABELS[o.type]}</td>
              <td className="py-2 pr-3 text-white">{o.item}</td>
              <td className="py-2 pr-3 text-gray-300">{CATEGORY_LABELS[o.category]}</td>
              {/* Posting-time snapshot — "—" guards the (post-backfill impossible) NULL. */}
              <td className="py-2 pr-3 text-gray-300">{o.publisher ?? '—'}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-gray-300">
                {o.fulfilledQty > 0 ? `${o.fulfilledQty}/${o.quantity}` : o.quantity}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-gray-300">
                {o.price_per_unit.toLocaleString('en-US')}
              </td>
              <td className={`py-2 pr-3 text-right tabular-nums ${signClass(signedTotal)}`}>
                {formatAUEC(signedTotal)}
              </td>
              <td className="py-2 text-gray-400">{STATUS_LABELS[o.status]}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
