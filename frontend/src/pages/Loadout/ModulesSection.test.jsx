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

  it('shows the cargo a module carries, and nothing for a module without a grid', () => {
    render(<ModulesSection modules={[{ ...modules[0], cargo: 38 }, { ...modules[1], cargo: null }]} ownedTitles={[]} />)
    expect(screen.getByText('38 SCU')).toBeInTheDocument()
    expect(screen.getAllByText(/SCU/)).toHaveLength(1)
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

// Generic template rows (AEGS_Retaliator_Module_Front, RSI_Galaxy_Module, the
// unreleased Galaxy crafting/refinery modules) come through with a null
// display_name. They are not fittable options and must not render as blank rows.
describe('ModulesSection — modules with no display name', () => {
  const withNameless = [
    { id: 1, uuid: 'u-base', port_name: 'hardpoint_front_module', display_name: 'Retaliator Unladen Front Module', size: 3, is_default: 1, price: null },
    { id: 2, uuid: 'u-template', port_name: 'hardpoint_front_module', display_name: null, class_name: 'AEGS_Retaliator_Module_Front', size: 3, is_default: 0, price: null },
    { id: 3, uuid: 'u-cargo', port_name: 'hardpoint_front_module', display_name: 'Retaliator Cargo Front Module', size: 3, is_default: 0, price: 18500 },
  ]

  it('read-only: renders one row per named module, none for the nameless one', () => {
    render(<ModulesSection modules={withNameless} ownedTitles={[]} />)
    const rows = screen.getAllByTestId('module-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.textContent).toMatch(/Retaliator (Unladen|Cargo) Front Module/)
    }
  })

  it('editable: the nameless module is not offered as a button', () => {
    render(<ModulesSection modules={withNameless} ownedTitles={[]} selections={{}} onSelect={() => {}} />)
    expect(screen.getAllByRole('button', { name: /Front Module/ })).toHaveLength(2)
    expect(screen.getAllByTestId('module-row')).toHaveLength(2)
  })

  it('a port whose modules are all nameless is not counted or rendered', () => {
    const mods = [
      ...withNameless,
      { id: 4, uuid: 'u-ghost', port_name: 'hardpoint_ghost_module', display_name: null, size: 3, is_default: 0, price: null },
    ]
    render(<ModulesSection modules={mods} ownedTitles={[]} />)
    expect(screen.getByText('1 slot')).toBeInTheDocument()
    expect(screen.queryByText('Ghost Module')).not.toBeInTheDocument()
  })

  it('renders nothing when every module is nameless', () => {
    const { container } = render(
      <ModulesSection modules={[{ id: 2, uuid: 'u-template', port_name: 'p', display_name: null, is_default: 0 }]} ownedTitles={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('editable: a saved selection pointing at a hidden module falls back to the default as Installed', () => {
    render(
      <ModulesSection
        modules={withNameless}
        ownedTitles={[]}
        selections={{ hardpoint_front_module: 'u-template' }}
        onSelect={() => {}}
      />,
    )
    const installed = screen.getAllByText('Installed')
    expect(installed).toHaveLength(1)
    expect(installed[0].closest('[data-testid="module-row"]').textContent).toMatch(/Unladen Front Module/)
    // The default is the installed one, so it is not also badged "Default".
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
  })

  it('a nameless default is kept (it is what is fitted) and labelled from its class name', () => {
    const mods = [
      { id: 1, uuid: 'u-def', port_name: 'hardpoint_module', display_name: null, class_name: 'RSI_Galaxy_Module', size: 3, is_default: 1, price: null },
      { id: 2, uuid: 'u-cargo', port_name: 'hardpoint_module', display_name: 'Galaxy Cargo Module', size: 3, is_default: 0, price: null },
    ]
    render(<ModulesSection modules={mods} ownedTitles={[]} selections={{}} onSelect={() => {}} />)
    const rows = screen.getAllByTestId('module-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toMatch(/RSI Galaxy Module/)
    expect(rows[0].textContent).toMatch(/Installed/)
  })
})
