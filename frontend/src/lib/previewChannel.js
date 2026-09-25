/**
 * Preview Channel option derivation.
 *
 * The Settings → Preview Channel picker used to hardcode its options
 * (`4.8.0-ptu` was baked in on 2026-05-08 and never revisited, so it was still
 * being offered when LIVE had moved on to 4.10.1). These helpers derive the
 * options from `/api/patches` instead, so the picker tracks reality:
 *
 *   - a preview channel appears only while it has data to preview
 *     (`build_number` is nulled by the PTU purge — see DELETE
 *     /api/admin/versions/ptu), and
 *   - it disappears the moment LIVE catches up to or passes it.
 *
 * Kept free of React so the rules are unit-testable on their own.
 */

/** Human blurb per preview channel. */
const CHANNEL_DESC = {
  PTU: 'Public Test Universe — preview data',
  EPTU: 'Evocati Public Test Universe — preview data',
}

/**
 * Split a game_versions `code` into numeric version parts.
 *
 * `4.10.1-live` → `[4, 10, 1]`. The channel suffix is dropped; anything that
 * isn't a dotted run of digits returns null so callers can fall back rather
 * than compare garbage.
 */
export function parseVersionCode(code) {
  if (typeof code !== 'string') return null
  const bare = code.split('-')[0]
  if (!/^\d+(\.\d+)*$/.test(bare)) return null
  return bare.split('.').map(Number)
}

/**
 * Compare two parsed version arrays. Returns -1, 0 or 1.
 *
 * Component-wise and numeric — a lexical compare would rank "4.8" above
 * "4.10", which is exactly the comparison this picker has to get right.
 * Missing trailing components count as zero, so 4.10 === 4.10.0.
 */
export function compareVersions(a, b) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/**
 * Build the preview-channel radio options from an `/api/patches` payload.
 *
 * A row is offered when all of these hold:
 *   1. it isn't the LIVE channel;
 *   2. it has a `build_number` (the purge nulls this, which is how a finished
 *      PTU cycle signals "no data here");
 *   3. its version is strictly ahead of the active LIVE version — a PTU that
 *      LIVE has reached has, by definition, shipped.
 *
 * At most one option per channel (the highest), sorted newest first. Rows with
 * a version we can't parse are kept if they pass (1) and (2): we can't prove
 * they're stale, and `build_number` is still a real liveness signal.
 */
export function derivePreviewOptions(patches) {
  if (!Array.isArray(patches)) return []

  const isLive = (row) => String(row?.channel ?? '').toUpperCase() === 'LIVE'

  // Active LIVE = the flagged default, else the highest LIVE row we can parse.
  const liveRows = patches.filter(isLive)
  const flagged = liveRows.find((row) => !!row.is_default)
  const liveVersion = flagged
    ? parseVersionCode(flagged.code)
    : liveRows
        .map((row) => parseVersionCode(row.code))
        .filter(Boolean)
        .sort(compareVersions)
        .pop() ?? null

  const bestPerChannel = new Map()
  for (const row of patches) {
    if (!row || isLive(row)) continue
    const channel = String(row.channel ?? '').toUpperCase()
    if (!channel) continue
    // Purged cycle — the row survives, its data doesn't.
    if (row.build_number === null || row.build_number === undefined || row.build_number === '') continue

    const version = parseVersionCode(row.code)
    // LIVE has caught up: the patch is released, there is nothing to preview.
    if (version && liveVersion && compareVersions(version, liveVersion) <= 0) continue

    const incumbent = bestPerChannel.get(channel)
    if (incumbent) {
      const a = incumbent.version
      const b = version
      // Prefer the parseable/higher one; an unparseable row never displaces one we can rank.
      if (!b || (a && compareVersions(b, a) <= 0)) continue
    }
    bestPerChannel.set(channel, { row, version, channel })
  }

  return [...bestPerChannel.values()]
    .sort((a, b) => {
      if (a.version && b.version) return compareVersions(b.version, a.version)
      if (a.version) return -1
      if (b.version) return 1
      return 0
    })
    .map(({ row, channel }) => ({
      key: row.code,
      channel,
      label: `${channel} ${String(row.code).split('-')[0]}`,
      desc: CHANNEL_DESC[channel] ?? 'Preview data',
    }))
}
