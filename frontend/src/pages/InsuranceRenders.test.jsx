import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Insurance from './Insurance'

const RENDER = { hash: 'abc123', width: 512, height: 512, view: 'side', kind: 'vehicle', item_key: 'anvl_carrack', variant: '' }

vi.mock('../hooks/useAPI', () => ({
  useAnalysis: () => ({
    data: {
      overview: { total_vehicles: 2, lti_count: 1, non_lti_count: 0, flight_ready: 2 },
      insurance_summary: {
        lti_ships: [{ ship_name: 'Carrack', is_lifetime: true, insurance_label: 'LTI', warbond: false, render: RENDER, image_url: 'https://img.example/carrack.webp' }],
        non_lti_ships: [],
        unknown_ships: [{ ship_name: 'Cutlass Black', render: null, image_url: 'https://img.example/cutlass.webp' }],
      },
    },
    loading: false, error: null, refetch: vi.fn(),
  }),
  useStatus: () => ({ data: { features: { multiAccount: false } }, loading: false, error: null }),
  useRsiAccounts: () => ({ data: { accounts: [] }, error: null }),
}))

describe('Insurance ship thumbnails', () => {
  it('shows the game render on an insured ship and the store image on an unknown one', () => {
    render(<MemoryRouter><Insurance /></MemoryRouter>)
    expect(screen.getByAltText('Carrack').getAttribute('src')).toBe('https://renders.scbridge.app/abc123/512.webp')
    expect(screen.getByAltText('Cutlass Black').getAttribute('src')).toBe('https://img.example/cutlass.webp')
  })
})
