/**
 * Pure helpers for the /hangar page. Extracted into a separate module
 * so they can be unit-tested without spinning up the full page (which
 * needs router + auth + data hooks).
 */

export const KIND_ORDER = [
  'Ship',
  'Skin',
  'Insurance',
  'FPS Equipment',
  'Component',
  'Hangar decoration',
  'Credits',
  'Other',
]

const KIND_LABELS = {
  uncategorised: 'Uncategorised',
  // Display label only — the DB kind stays 'Skin' (set by the
  // hangar-sync import classifier so it matches RSI's own taxonomy).
  // "Paints" is the user-facing term Gavin asked for, matching how
  // they appear on Ship DB + /loadout selector.
  Skin: 'Paints',
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind
}

/** Strip RSI's verbose pledge-name boilerplate so the sub-line stays scannable. */
export function cleanPledgeName(name) {
  if (!name) return null
  return name
    .replace(/^Standalone\s+Ships?\s*-\s*/i, '')
    .replace(/^Package\s*-\s*/i, '')
    .replace(/^Add-Ons\s*-\s*/i, '')
    .replace(/^Combo\s*-\s*/i, '')
    .replace(/^Upgrade\s*-\s*/i, 'CCU: ')
    .trim()
}

export function formatPledgeValue(cents) {
  if (cents == null || cents <= 0) return null
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

/**
 * Order the kinds returned by the API into the canonical chip-row sequence.
 * Known kinds appear in KIND_ORDER first; unknown ones appended in
 * insertion order; 'uncategorised' always last.
 */
export function orderedKinds(counts) {
  const seen = new Set()
  const result = []
  for (const k of KIND_ORDER) {
    if (counts[k]) {
      result.push(k)
      seen.add(k)
    }
  }
  for (const k of Object.keys(counts)) {
    if (k === 'uncategorised') continue
    if (!counts[k]) continue
    if (!seen.has(k)) {
      result.push(k)
      seen.add(k)
    }
  }
  if (counts.uncategorised) result.push('uncategorised')
  return result
}

/** Count items per kind (null kind counts as 'uncategorised'). */
export function countKinds(items) {
  const counts = {}
  for (const item of items) {
    const kind = item.kind ?? 'uncategorised'
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}

/**
 * Normalise an RSI media URL to an absolute form. The hangar-sync extension
 * sometimes captures the URL as a path-relative `/media/...` (RSI's <img src>
 * is relative on some pages). Rendered straight into <img src>, that resolves
 * against the current origin (scbridge.app) and 404s.
 *
 * Returns the URL unchanged if it's already absolute or empty. Otherwise
 * prepends https://media.robertsspaceindustries.com.
 *
 * Discovered 2026-05-16 — all of Gavin's Merchantman/Polaris/Dragonfly
 * Yellowjacket/Nox Kue ship pledge items had `/media/...` URLs and
 * rendered as broken images. Affects ships, paints, and any item where
 * the extension scraped from a context that used path-relative img tags.
 * Long-term fix is in the extension parser (queued); this is the render
 * fallback so existing rows render correctly without a re-sync.
 */
export function normaliseMediaUrl(url) {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/media/')) return `https://media.robertsspaceindustries.com${url}`
  return url
}

/** Filter predicate factory used by the page-level useMemo. */
export function buildItemFilter({ search, kindFilter, mfrFilter }) {
  const needle = (search ?? '').trim().toLowerCase()
  return (item) => {
    if (kindFilter && kindFilter !== 'all') {
      const itemKind = item.kind ?? 'uncategorised'
      if (itemKind !== kindFilter) return false
    }
    if (mfrFilter && mfrFilter !== 'all') {
      if ((item.manufacturer_code ?? '') !== mfrFilter) return false
    }
    if (needle) {
      const haystack = [
        item.title,
        item.custom_name,
        item.manufacturer_code,
        item.manufacturer_name,
        item.pledge_name,
        item.serial,
        item.kind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  }
}
