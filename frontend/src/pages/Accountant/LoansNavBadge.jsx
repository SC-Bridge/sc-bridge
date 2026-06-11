import { useBadges } from './hooks'

// Self-fetching count pill for the Loans nav item.
export default function LoansNavBadge() {
  const { data } = useBadges()
  if (!data || !(data.loansDueSoon > 0)) return null
  return (
    <span
      data-testid="loans-nav-badge"
      className="ml-auto text-xs rounded-full bg-sc-accent/20 text-sc-accent px-1.5 py-0.5 tabular-nums"
    >
      {data.loansDueSoon}
    </span>
  )
}
