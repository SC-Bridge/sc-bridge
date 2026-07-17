import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import WhatsChangedBanner from './WhatsChangedBanner'

// CIG ships literal "PLACEHOLDER" strings; 4.9 appended item tags to them.
// The endpoint splits those out as placeholder_changed_count so the banner
// lists only real content changes plus one collapsed housekeeping row.
const DIFF = {
  from: '4.8.2-live',
  to: '4.9.0-live',
  added_count: 2,
  removed_count: 1,
  changed_count: 1,
  placeholder_changed_count: 10,
  added: ['new_key_a', 'new_key_b'],
  removed: ['old_key'],
  changed: [{ key: 'Human_Surnames_3433', oldValue: 'Mussolini', newValue: 'Musson' }],
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => DIFF }))
})

describe('WhatsChangedBanner — placeholder housekeeping row', () => {
  it('collapses placeholder churn into a single count row', async () => {
    render(<WhatsChangedBanner />)
    // auto-expands on first view of this patch; changed tab is the default
    await waitFor(() => expect(screen.getByText(/placeholder housekeeping/i)).toBeInTheDocument())
    expect(screen.getByText(/\+10 placeholder housekeeping changes/i)).toBeInTheDocument()
    // the real change is still listed individually
    expect(screen.getByText('Human_Surnames_3433')).toBeInTheDocument()
  })

  it('shows the REAL change count in the tab, not real+placeholder', async () => {
    render(<WhatsChangedBanner />)
    await waitFor(() => expect(screen.getByText(/Changed 1/)).toBeInTheDocument())
  })

  it('renders no housekeeping row when the patch has none', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ...DIFF, placeholder_changed_count: 0 }) })
    render(<WhatsChangedBanner />)
    await waitFor(() => expect(screen.getByText('Human_Surnames_3433')).toBeInTheDocument())
    expect(screen.queryByText(/placeholder housekeeping/i)).toBeNull()
  })
})
