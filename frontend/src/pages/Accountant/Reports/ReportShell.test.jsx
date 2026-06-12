import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportShell from './ReportShell'

function makeQuery(overrides = {}) {
  return { data: null, error: null, loading: false, refetch: () => {}, ...overrides }
}

const baseProps = {
  title: 'TEST REPORT',
  subtitle: 'A subtitle',
  params: new URLSearchParams(),
  onParams: () => {},
}

describe('ReportShell', () => {
  it('error state shows alert with message and a working Retry button', async () => {
    const refetch = vi.fn()
    render(
      <ReportShell {...baseProps} query={makeQuery({ error: new Error('boom'), refetch })}>
        {() => <div>body</div>}
      </ReportShell>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('body')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('loading with no data shows the loading state, not children', () => {
    render(
      <ReportShell {...baseProps} query={makeQuery({ loading: true })}>
        {() => <div>body</div>}
      </ReportShell>,
    )
    expect(screen.queryByText('body')).not.toBeInTheDocument()
  })

  it('calls children with the loaded data', () => {
    render(
      <ReportShell {...baseProps} query={makeQuery({ data: { answer: 42 } })}>
        {(data) => <div>answer is {data.answer}</div>}
      </ReportShell>,
    )
    expect(screen.getByText('answer is 42')).toBeInTheDocument()
  })

  it('renders the interval selector only when withInterval is set', () => {
    const { rerender } = render(
      <ReportShell {...baseProps} query={makeQuery({ data: {} })} withInterval>
        {() => null}
      </ReportShell>,
    )
    expect(screen.getByText(/interval/i)).toBeInTheDocument()
    rerender(
      <ReportShell {...baseProps} query={makeQuery({ data: {} })}>
        {() => null}
      </ReportShell>,
    )
    expect(screen.queryByText(/^interval$/i)).not.toBeInTheDocument()
  })

  it('keeps showing stale data while a refetch is in flight (loading && data)', () => {
    render(
      <ReportShell {...baseProps} query={makeQuery({ loading: true, data: { answer: 7 } })}>
        {(data) => <div>answer is {data.answer}</div>}
      </ReportShell>,
    )
    expect(screen.getByText('answer is 7')).toBeInTheDocument()
  })
})
