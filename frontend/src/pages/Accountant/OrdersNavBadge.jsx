import { useBadges } from './hooks'

// Self-fetching count pill for the Orders nav item.
export default function OrdersNavBadge() {
  const { data } = useBadges()
  if (!data || !(data.ordersOverdue > 0)) return null
  return (
    <span
      data-testid="orders-nav-badge"
      className="ml-auto text-xs rounded-full bg-sc-accent/20 text-sc-accent px-1.5 py-0.5 tabular-nums"
    >
      {data.ordersOverdue}
    </span>
  )
}
