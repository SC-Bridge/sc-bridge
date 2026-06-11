/**
 * Settings page — integration smoke test.
 *
 * Verifies that AccountantSettingsSection is rendered at the bottom of the
 * site Settings page. Heavy hooks are mocked at the module level so this test
 * stays fast and doesn't require auth wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../hooks/useFontPreference', () => ({
  default: () => ({ fontPreference: 'default', setFontPreference: vi.fn() }),
}))

vi.mock('../hooks/useTimezone', () => ({
  default: () => ({ timezone: 'UTC', setTimezone: vi.fn() }),
}))

vi.mock('../hooks/usePrivacyMode', () => ({
  default: () => ({
    mode: 'off',
    privacyMode: false,
    stealthPercent: 10,
    setStealthPercent: vi.fn(),
    setMode: vi.fn(),
  }),
}))

vi.mock('../hooks/useAPI', () => ({
  useLLMConfig: () => ({ data: null, refetch: vi.fn() }),
  setLLMConfig: vi.fn(),
  testLLMConnection: vi.fn(),
  usePreferences: () => ({ data: {}, refetch: vi.fn() }),
  setPreferences: vi.fn(),
}))

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({ data: null }),
  authClient: {},
  signOut: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Stub fetch for AccountantSettingsSection's internal preferences fetch
  global.fetch = vi.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
      return new Response(JSON.stringify({ accountantTier: 'easy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Settings page — Accountant section', () => {
  it('renders the Accountant section at the bottom of the Settings page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>,
    )

    // The AccountantSettingsSection eventually renders the tier panel after its fetch.
    // The "Accounting Tier" heading is inside the Accountant PanelSection.
    await waitFor(() =>
      expect(screen.getByText('Accounting Tier')).toBeInTheDocument(),
    )
  })

  it('Accountant section appears after the AI Providers section', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByText('Accounting Tier')).toBeInTheDocument(),
    )

    // Verify ordering: AI Providers section exists and comes before Accounting Tier
    const allText = container.textContent
    const aiProvidersPos = allText.indexOf('AI Providers')
    const accountantPos = allText.indexOf('Accountant')
    expect(aiProvidersPos).toBeGreaterThan(-1)
    expect(accountantPos).toBeGreaterThan(aiProvidersPos)
  })
})
