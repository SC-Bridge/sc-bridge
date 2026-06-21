import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ModulesSection from './ModulesSection'

const modules = [
  { id: 1, uuid: 'u-cargo', port_name: 'hardpoint_front_module', display_name: 'Retaliator Cargo Module - Front', size: 3, is_default: 0, price: 18500 },
  { id: 2, uuid: 'u-base', port_name: 'hardpoint_front_module', display_name: 'Retaliator Base Module - Front', size: 3, is_default: 1, price: null },
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

  it('is read-only without onSelect — no Installed badge, options are not buttons', () => {
    render(<ModulesSection modules={modules} ownedTitles={[]} />)
    expect(screen.queryByText('Installed')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cargo Module/ })).not.toBeInTheDocument()
  })

  it('editable: clicking an option calls onSelect with the port + module', () => {
    const onSelect = vi.fn()
    render(<ModulesSection modules={modules} ownedTitles={[]} selections={{}} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Retaliator Cargo Module - Front'))
    expect(onSelect).toHaveBeenCalledWith('hardpoint_front_module', expect.objectContaining({ uuid: 'u-cargo' }))
  })

  it('editable: the selected module shows the Installed badge', () => {
    render(
      <ModulesSection
        modules={modules}
        ownedTitles={[]}
        selections={{ hardpoint_front_module: 'u-cargo' }}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Installed')).toBeInTheDocument()
  })

  it('editable: with no selection, the default is the installed one', () => {
    render(<ModulesSection modules={modules} ownedTitles={[]} selections={{}} onSelect={() => {}} />)
    // Default module (base) is installed by default → shows Installed, not Default.
    expect(screen.getByText('Installed')).toBeInTheDocument()
  })
})
