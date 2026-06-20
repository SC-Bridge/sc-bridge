/**
 * Extract the loot uuid from a /loot/<uuid> (or /loot/<uuid>/detail) href.
 * Returns null for any other href. Used to intercept component links in chat
 * and open the item detail pane in place instead of navigating.
 */
export function parseLootUuid(href) {
  if (typeof href !== 'string') return null
  const m = href.match(/^\/loot\/([^/?#]+)/)
  return m ? m[1] : null
}
