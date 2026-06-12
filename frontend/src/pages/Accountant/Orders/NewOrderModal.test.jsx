import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewOrderModal from './NewOrderModal'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, id: 90 }) })
})
afterEach(() => vi.restoreAllMocks())

async function fillBasics() {
  await userEvent.selectOptions(screen.getByLabelText(/category/i), 'trading')
  await userEvent.selectOptions(screen.getByLabelText(/^tag/i), 'minerals')
  await userEvent.type(screen.getByLabelText(/item/i), 'Laranite')
  await userEvent.type(screen.getByLabelText(/quantity/i), '200')
  await userEvent.type(screen.getByLabelText(/price/i), '3200')
}

describe('NewOrderModal', () => {
  it('submits type/category/tag/item/quantity/price and computed contract fields', async () => {
    const onSaved = vi.fn()
    render(<NewOrderModal onClose={() => {}} onSaved={onSaved} />)
    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: /post order/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const [url, opts] = globalThis.fetch.mock.calls.find(([u]) => String(u).endsWith('/api/accountant/orders'))
    expect(url).toBe('/api/accountant/orders')
    expect(opts.method).toBe('POST')
    const sent = JSON.parse(opts.body)
    expect(sent.type).toBe('sale')
    expect(sent.category).toBe('trading')
    expect(sent.tag).toBe('minerals')
    expect(sent.item).toBe('Laranite')
    expect(sent.quantity).toBe(200)
    expect(sent.price_per_unit).toBe(3200)
    // Contract defaults travel with the body (server recomputes modified_fields).
    expect(sent.start_at).toBeDefined()
    expect(sent.fine_interval).toBe('daily')
    expect(sent.fine_rate_type).toBe('percent')
    expect(sent.fine_rate).toBe(0.5)
    expect(sent.rate_change_pct).toBe(0)
    expect(sent.termination_clause).toBe('standard')
    // "None" rate change maps to omission, never '' (backend enum would 400).
    expect(sent).not.toHaveProperty('rate_change_condition')
    // Private market enforcement: visibility keys never leave the client.
    expect(Object.keys(sent).filter((k) => k.startsWith('vis_'))).toEqual([])
  })

  it('live total preview = round(qty × price)', async () => {
    render(<NewOrderModal onClose={() => {}} onSaved={() => {}} />)
    await userEvent.type(screen.getByLabelText(/quantity/i), '200')
    await userEvent.type(screen.getByLabelText(/price/i), '3200')
    expect(screen.getByText(/640,000 aUEC/)).toBeInTheDocument()
  })

  it('marks contract fields deviating from the template with "← modified"', async () => {
    render(<NewOrderModal onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryAllByTestId('modified-marker')).toHaveLength(0)
    // fireEvent.change: jsdom sanitizes partial datetime-local values away under char-by-char typing.
    fireEvent.change(screen.getByLabelText(/delivery date/i), { target: { value: '2026-06-30T12:00' } })
    const fineRate = screen.getByLabelText(/fine rate$/i)
    await userEvent.clear(fineRate)
    await userEvent.type(fineRate, '1.5')
    expect(screen.getAllByTestId('modified-marker')).toHaveLength(2)
    expect(within(screen.getByTestId('contract-deliver_by')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_rate')).getByTestId('modified-marker')).toBeInTheDocument()
    expect(within(screen.getByTestId('contract-fine_interval')).queryByTestId('modified-marker')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('contract-termination_clause')).queryByTestId('modified-marker')).not.toBeInTheDocument()
  })

  it('insufficient-funds 400 renders the rejection panel from err.details', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Insufficient funds', balance: 240000, lockedInPOs: 400000, required: 950000 }),
    })
    const onSaved = vi.fn()
    render(<NewOrderModal onClose={() => {}} onSaved={onSaved} />)
    await fillBasics()
    await userEvent.click(screen.getByLabelText(/purchase/i))
    await userEvent.click(screen.getByRole('button', { name: /post order/i }))
    const panel = await screen.findByTestId('fund-rejection')
    expect(panel).toHaveTextContent(/insufficient funds/i)
    expect(panel).toHaveTextContent('950,000')
    expect(panel).toHaveTextContent('240,000')
    expect(panel).toHaveTextContent('400,000')
    expect(panel).toHaveTextContent('Reduce quantity or cancel another open PO.')
    expect(onSaved).not.toHaveBeenCalled()
    // Modal stays open for correction.
    expect(screen.getByRole('button', { name: /post order/i })).toBeInTheDocument()
  })

  it('generic 400 falls back to the inline alert', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Bad order' }) })
    const onSaved = vi.fn()
    render(<NewOrderModal onClose={() => {}} onSaved={onSaved} />)
    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: /post order/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bad order'))
    expect(screen.queryByTestId('fund-rejection')).not.toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
