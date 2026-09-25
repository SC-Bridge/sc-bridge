import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

const LIVE = { code: '4.10.1-live', channel: 'LIVE', is_default: 1, released_at: '2026-09-16', build_number: '12660092' }

/** Mock every endpoint Settings touches; `patches` is the one under test. */
function mockApi({ patches = [LIVE], preferences = {} } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url)
    if (u.includes('/api/patches')) return Promise.resolve({ ok: true, status: 200, json: async () => patches })
    if (u.includes('/api/settings/preferences')) return Promise.resolve({ ok: true, status: 200, json: async () => preferences })
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
  })
}

function renderSettings() {
  return render(<MemoryRouter><Settings /></MemoryRouter>)
}

describe('Settings → Preview Channel panel', () => {
  beforeEach(() => { mockApi() })
  afterEach(() => { vi.restoreAllMocks() })

  it('hides the panel when only LIVE exists', async () => {
    renderSettings()
    // Wait for the page to settle (Display panel always renders).
    await screen.findByText('Display')
    expect(screen.queryByText('Preview Channel')).not.toBeInTheDocument()
  })

  it('hides the panel when the PTU row is purged (build_number null)', async () => {
    mockApi({ patches: [LIVE, { code: '4.8.0-ptu', channel: 'PTU', is_default: 0, build_number: null }] })
    renderSettings()
    await screen.findByText('Display')
    expect(screen.queryByText('Preview Channel')).not.toBeInTheDocument()
  })

  it('hides the panel when the PTU is behind LIVE even with a build number', async () => {
    // Exactly the staging Test-3 state: 4.9.0-ptu w/ build 12700001, LIVE 4.10.1.
    mockApi({ patches: [LIVE, { code: '4.9.0-ptu', channel: 'PTU', is_default: 0, build_number: '12700001' }] })
    renderSettings()
    await screen.findByText('Display')
    expect(screen.queryByText('Preview Channel')).not.toBeInTheDocument()
  })

  it('SHOWS the panel with the PTU option when the PTU is ahead of LIVE', async () => {
    // Exactly the staging Test-2 state: 4.10.2-ptu w/ build 12700001, LIVE 4.10.1.
    mockApi({ patches: [LIVE, { code: '4.10.2-ptu', channel: 'PTU', is_default: 0, build_number: '12700001' }] })
    renderSettings()
    expect(await screen.findByText('Preview Channel')).toBeInTheDocument()
    expect(screen.getByText('PTU 4.10.2')).toBeInTheDocument()
    // Two radios: LIVE + the one preview. ("LIVE" as bare text appears
    // elsewhere on the page, so assert on the radio group, not the word.)
    const radios = document.querySelectorAll('input[name="preview-channel"]')
    expect(radios).toHaveLength(2)
    expect([...radios].map((r) => r.value)).toEqual(['', '4.10.2-ptu'])
  })

  it('keeps the panel for a user stranded on a preview that has ended', async () => {
    mockApi({
      patches: [LIVE, { code: '4.8.0-ptu', channel: 'PTU', is_default: 0, build_number: null }],
      preferences: { adminPreviewPatch: '4.8.0-ptu' },
    })
    renderSettings()
    expect(await screen.findByText('Preview Channel')).toBeInTheDocument()
    expect(screen.getByText(/has ended/)).toBeInTheDocument()
  })
})
