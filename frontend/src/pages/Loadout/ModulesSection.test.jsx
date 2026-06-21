import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModulesSection from './ModulesSection'

const modules = [
  { id: 1, port_name: 'hardpoint_front_module', display_name: 'Retaliator Cargo Module - Front', size: 3, is_default: 0, price: 18500 },
  { id: 2, port_name: 'hardpoint_front_module', display_name: 'Retaliator Base Module - Front', size: 3, is_default: 1, price: null },
]

describe('ModulesSection', () => {
  it('renders the UEX price for a priced module', () => {
    render(<ModulesSection modules={modules} ownedTitles={[]} />)
    expect(screen.getByText('18,500 aUEC')).toBeInTheDocument()
  })

  it('renders an em dash for a module with no price', () => {
    render(<ModulesSection modules={modules} ownedTitles={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('groups by port and labels the default', () => {
    render(<ModulesSection modules={modules} ownedTitles={[]} />)
    expect(screen.getByText('Front Module')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('renders nothing when there are no modules', () => {
    const { container } = render(<ModulesSection modules={[]} ownedTitles={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
