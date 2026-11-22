import { describe, it, expect } from 'vitest'
import { renderUrl, RENDER_ORIGIN } from './renders'

describe('renderUrl', () => {
  it('builds the URL from the hash and size', () => {
    expect(RENDER_ORIGIN).toBe('https://renders.scbridge.app')
    expect(renderUrl({ hash: 'abc' }, 512)).toBe('https://renders.scbridge.app/abc/512.webp')
    expect(renderUrl({ hash: 'abc' }, 2048)).toBe('https://renders.scbridge.app/abc/2048.webp')
  })

  it('returns null when there is no render', () => {
    expect(renderUrl(null, 512)).toBeNull()
    expect(renderUrl(undefined, 512)).toBeNull()
  })
})
