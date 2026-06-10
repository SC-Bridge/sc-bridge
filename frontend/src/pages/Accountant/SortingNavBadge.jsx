import { useBadges } from './hooks'

// Self-fetching count pill for the Sorting List nav item.
export default function SortingNavBadge() {
  const { data } = useBadges()
  if (!data || !(data.sorting > 0)) return null
  return (
    <span
      data-testid="sorting-nav-badge"
      className="ml-auto text-xs rounded-full bg-sc-accent/20 text-sc-accent px-1.5 py-0.5 tabular-nums"
    >
      {data.sorting}
    </span>
  )
}
