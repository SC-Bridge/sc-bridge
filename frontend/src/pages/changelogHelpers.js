// Helpers for the changelog page (#124).

export const CATEGORY_META = {
  feature: { label: 'New', badge: 'border-sc-accent2/30 text-sc-accent2 bg-sc-accent2/10' },
  improvement: { label: 'Improved', badge: 'border-sc-accent/30 text-sc-accent bg-sc-accent/10' },
  fix: { label: 'Fixed', badge: 'border-amber-500/30 text-amber-300 bg-amber-500/10' },
}

export function categoryMeta(category) {
  return CATEGORY_META[category] || { label: category || 'Change', badge: 'border-gray-500/30 text-gray-400 bg-gray-500/10' }
}

// Group published entries by entry_date, preserving the server's newest-first
// ordering. Returns [{ date, version, entries: [...] }] where version is the
// first non-empty version seen for that date (if any).
export function groupChangelogByDate(entries) {
  const order = []
  const byDate = new Map()
  for (const e of entries || []) {
    const date = e.entry_date
    if (!byDate.has(date)) {
      byDate.set(date, { date, version: e.version || null, entries: [] })
      order.push(date)
    }
    const group = byDate.get(date)
    if (!group.version && e.version) group.version = e.version
    group.entries.push(e)
  }
  return order.map((d) => byDate.get(d))
}
