import { describe, it, expect } from 'vitest'
import { parseVersionCode, compareVersions, derivePreviewOptions } from './previewChannel'

describe('parseVersionCode', () => {
  it('parses a channel-suffixed code into numeric parts', () => {
    expect(parseVersionCode('4.10.1-live')).toEqual([4, 10, 1])
    expect(parseVersionCode('4.8.0-ptu')).toEqual([4, 8, 0])
    expect(parseVersionCode('4.11.0-eptu')).toEqual([4, 11, 0])
  })

  it('parses a bare version with no channel suffix', () => {
    expect(parseVersionCode('4.10')).toEqual([4, 10])
  })

  it('returns null for unparseable input', () => {
    expect(parseVersionCode(null)).toBe(null)
    expect(parseVersionCode('')).toBe(null)
    expect(parseVersionCode('nightly-ptu')).toBe(null)
    expect(parseVersionCode(42)).toBe(null)
  })
})

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    // The whole point: "4.10" must sort ABOVE "4.8", which string compare gets wrong.
    expect(compareVersions([4, 10, 1], [4, 8, 0])).toBe(1)
    expect(compareVersions([4, 8, 0], [4, 10, 1])).toBe(-1)
  })

  it('treats missing trailing parts as zero', () => {
    expect(compareVersions([4, 10], [4, 10, 0])).toBe(0)
    expect(compareVersions([4, 10, 1], [4, 10])).toBe(1)
  })

  it('reports equality', () => {
    expect(compareVersions([4, 10, 1], [4, 10, 1])).toBe(0)
  })
})

describe('derivePreviewOptions', () => {
  const live = { code: '4.10.1-live', channel: 'LIVE', is_default: 1, build_number: '12660092' }

  it('returns no options when only LIVE exists (current prod state)', () => {
    expect(derivePreviewOptions([live])).toEqual([])
  })

  it('returns no options for a purged PTU row (build_number null — current staging state)', () => {
    const ptu = { code: '4.8.0-ptu', channel: 'PTU', is_default: 0, build_number: null }
    expect(derivePreviewOptions([live, ptu])).toEqual([])
  })

  it('treats an empty-string build_number as purged', () => {
    const ptu = { code: '4.11.0-ptu', channel: 'PTU', is_default: 0, build_number: '' }
    expect(derivePreviewOptions([live, ptu])).toEqual([])
  })

  it('hides a stale PTU that LIVE has caught up to or passed', () => {
    // The bug in the screenshot: PTU 4.8.0 still offered while LIVE is 4.10.1.
    const stale = { code: '4.8.0-ptu', channel: 'PTU', is_default: 0, build_number: '11801234' }
    expect(derivePreviewOptions([live, stale])).toEqual([])
  })

  it('hides a PTU at the same version as LIVE (the patch has shipped)', () => {
    const shipped = { code: '4.10.1-ptu', channel: 'PTU', is_default: 0, build_number: '12660092' }
    expect(derivePreviewOptions([live, shipped])).toEqual([])
  })

  it('offers a PTU that is genuinely ahead of LIVE', () => {
    const ahead = { code: '4.10.2-ptu', channel: 'PTU', is_default: 0, build_number: '12700001' }
    expect(derivePreviewOptions([live, ahead])).toEqual([
      { key: '4.10.2-ptu', channel: 'PTU', label: 'PTU 4.10.2', desc: 'Public Test Universe — preview data' },
    ])
  })

  it('offers PTU and EPTU together, highest version first', () => {
    const ptu = { code: '4.10.2-ptu', channel: 'PTU', is_default: 0, build_number: '12700001' }
    const eptu = { code: '4.11.0-eptu', channel: 'EPTU', is_default: 0, build_number: '12800001' }
    expect(derivePreviewOptions([live, ptu, eptu]).map((o) => o.key)).toEqual(['4.11.0-eptu', '4.10.2-ptu'])
  })

  it('keeps only the highest row per channel', () => {
    const old = { code: '4.10.2-ptu', channel: 'PTU', is_default: 0, build_number: '12700001' }
    const newer = { code: '4.11.0-ptu', channel: 'PTU', is_default: 0, build_number: '12800002' }
    expect(derivePreviewOptions([live, old, newer]).map((o) => o.key)).toEqual(['4.11.0-ptu'])
  })

  it('falls back to the highest LIVE row when none is flagged default', () => {
    const rows = [
      { code: '4.10.1-live', channel: 'LIVE', is_default: 0, build_number: '12660092' },
      { code: '4.8.0-live', channel: 'LIVE', is_default: 0, build_number: '11500000' },
      { code: '4.8.0-ptu', channel: 'PTU', is_default: 0, build_number: '11801234' },
    ]
    expect(derivePreviewOptions(rows)).toEqual([])
  })

  it('offers a preview with an unparseable code rather than silently dropping it', () => {
    // Can't version-compare it, so defer to build_number as the liveness signal.
    const odd = { code: 'nightly-ptu', channel: 'PTU', is_default: 0, build_number: '12900000' }
    expect(derivePreviewOptions([live, odd]).map((o) => o.key)).toEqual(['nightly-ptu'])
  })

  it('handles missing / malformed API payloads defensively', () => {
    expect(derivePreviewOptions(null)).toEqual([])
    expect(derivePreviewOptions(undefined)).toEqual([])
    expect(derivePreviewOptions([])).toEqual([])
    expect(derivePreviewOptions({ error: 'boom' })).toEqual([])
  })
})
