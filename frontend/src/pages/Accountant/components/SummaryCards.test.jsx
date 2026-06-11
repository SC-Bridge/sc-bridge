import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SummaryCards from './SummaryCards'

const CARDS = [
  { label: 'Balance', value: '4,600 aUEC', sub: 'All time', tone: 'positive' },
  { label: 'Expenses', value: '-1,200 aUEC', tone: 'negative' },
  { label: 'Entries', value: '42' },
]

describe('SummaryCards', () => {
  it('renders the container with data-testid', () => {
    render(<SummaryCards cards={CARDS} />)
    expect(screen.getByTestId('summary-cards')).toBeInTheDocument()
  })

  it('renders all card labels', () => {
    render(<SummaryCards cards={CARDS} />)
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Entries')).toBeInTheDocument()
  })

  it('renders all card values', () => {
    render(<SummaryCards cards={CARDS} />)
    expect(screen.getByText('4,600 aUEC')).toBeInTheDocument()
    expect(screen.getByText('-1,200 aUEC')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders optional sub text when provided', () => {
    render(<SummaryCards cards={CARDS} />)
    expect(screen.getByText('All time')).toBeInTheDocument()
  })

  it('does not render sub element when absent', () => {
    render(<SummaryCards cards={[{ label: 'Test', value: '0' }]} />)
    // Only one card, no sub text at all
    expect(screen.queryByText('All time')).not.toBeInTheDocument()
  })

  it('applies text-sc-success for positive tone', () => {
    render(<SummaryCards cards={[{ label: 'Bal', value: '100', tone: 'positive' }]} />)
    const value = screen.getByText('100')
    expect(value.className).toContain('text-sc-success')
  })

  it('applies text-sc-danger for negative tone', () => {
    render(<SummaryCards cards={[{ label: 'Exp', value: '-50', tone: 'negative' }]} />)
    const value = screen.getByText('-50')
    expect(value.className).toContain('text-sc-danger')
  })

  it('applies text-white for neutral tone (default)', () => {
    render(<SummaryCards cards={[{ label: 'Neutral', value: '0' }]} />)
    const value = screen.getByText('0')
    expect(value.className).toContain('text-white')
  })

  it('applies text-white when tone is explicitly neutral', () => {
    render(<SummaryCards cards={[{ label: 'Neutral', value: '0', tone: 'neutral' }]} />)
    const value = screen.getByText('0')
    expect(value.className).toContain('text-white')
  })
})
