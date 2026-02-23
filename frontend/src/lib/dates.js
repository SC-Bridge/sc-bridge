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
  const date = new Date(isoString)
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
  const date = new Date(isoString)
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
