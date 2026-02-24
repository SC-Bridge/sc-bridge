/**
 * Shared date formatting using Intl.DateTimeFormat.
 * Target format: 2026-FEB-23 07:09 PM NZDT
 */

/**
 * Format an ISO date string to: YYYY-MMM-DD HH:MM AM/PM TZ
 * @param {string|null|undefined} isoString
 * @param {string} timezone - IANA timezone (e.g. 'Pacific/Auckland')
 * @returns {string}
 */
export function formatDate(isoString, timezone) {
  if (!isoString) return '\u2014'
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" — no T, no Z.
  // Browsers treat that space-separated format as local time, not UTC.
  // Normalise to ISO 8601 UTC so conversion is always correct.
  let s = isoString.trim()
  const hasTimezone = s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)
  if (!hasTimezone) s = s.replace(' ', 'T') + 'Z'
  const date = new Date(s)
  if (isNaN(date.getTime())) return '\u2014'

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value || ''

  const year = get('year')
  const month = get('month').toUpperCase()
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const dayPeriod = get('dayPeriod').toUpperCase()
  const tz = get('timeZoneName')

  return `${year}-${month}-${day} ${hour}:${minute} ${dayPeriod} ${tz}`
}

/**
 * Format an ISO date string to date only: YYYY-MMM-DD
 * @param {string|null|undefined} isoString
 * @param {string} timezone - IANA timezone
 * @returns {string}
 */
export function formatDateOnly(isoString, timezone) {
  if (!isoString) return '\u2014'
  let s = isoString.trim()
  const hasTimezone = s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)
  if (!hasTimezone) s = s.replace(' ', 'T') + 'Z'
  const date = new Date(s)
  if (isNaN(date.getTime())) return '\u2014'

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value || ''

  return `${get('year')}-${get('month').toUpperCase()}-${get('day')}`
}
