/**
 * How old is the user's RSI hangar sync, and is that old enough to warn about?
 *
 * The Fleet and Hangar pages show melt values and buy-back state straight from
 * the last extension sync. Nothing on those pages said how old that snapshot
 * was, so a user who melted a ship months ago still saw it as meltable and
 * reasonably assumed SC Bridge was wrong. These helpers feed the staleness
 * banner that closes that gap.
 */
import { parseDate } from './dates'

const DAY_MS = 24 * 60 * 60 * 1000

/** A sync older than this many days gets the banner. */
export const STALE_AFTER_DAYS = 30

/**
 * Whole days since the last sync, or null when there is nothing to measure
 * (never synced, or an unparseable timestamp).
 * @param {string|null|undefined} lastSynced — `user_rsi_profiles.synced_at` (SQLite UTC) or ISO
 * @param {number} [now=Date.now()] — epoch millis, injectable for tests
 * @returns {number|null}
 */
export function syncAgeDays(lastSynced, now = Date.now()) {
  const date = parseDate(lastSynced)
  if (!date) return null
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS))
}

/**
 * True when the last sync is at least `thresholdDays` old. Never-synced is
 * not stale: there is no snapshot to be out of date, and the pages already
 * handle the empty case.
 * @param {string|null|undefined} lastSynced
 * @param {number} [now=Date.now()]
 * @param {number} [thresholdDays=STALE_AFTER_DAYS]
 * @returns {boolean}
 */
export function isSyncStale(lastSynced, now = Date.now(), thresholdDays = STALE_AFTER_DAYS) {
  const days = syncAgeDays(lastSynced, now)
  return days !== null && days >= thresholdDays
}

/**
 * Plain-English age: "today", "yesterday", "5 days ago", "2 weeks ago",
 * "5 months ago". Coarse on purpose — the banner is a nudge, not a clock.
 * @param {number|null} days
 * @returns {string}
 */
export function describeSyncAge(days) {
  if (days === null || days === undefined) return ''
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}
