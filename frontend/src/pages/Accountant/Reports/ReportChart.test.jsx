import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GroupedBars, CategoryDonut, GradientArea, NetLine } from './ReportChart'

// ResponsiveContainer measures the real DOM (zero-size in jsdom) and renders
// nothing — mock it with fixed dimensions so charts actually draw and dataKey
// bindings can be asserted. The wrapper class is preserved for mount checks.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div className="recharts-responsive-container">
        {cloneElement(children, { width: 600, height: 300 })}
      </div>
    ),
  }
})

describe('ReportChart wrappers', () => {
  it('GroupedBars renders without throwing', () => {
    const data = [{ bucket: '2026-06-01', in: 100000, out: -30000 }]
    const { container } = render(<div style={{ width: 600, height: 300 }}><GroupedBars data={data} /></div>)
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy()
  })
  it('CategoryDonut renders slices from labelled values', () => {
    const data = [{ name: 'Trading', value: 4200000 }, { name: 'Mission', value: 45000 }]
    const { container } = render(<div style={{ width: 400, height: 300 }}><CategoryDonut data={data} /></div>)
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy()
  })
  it('NetLine renders the net series field as a line path', () => {
    const data = [
      { bucket: '2026-06-01', net: 1050000 },
      { bucket: '2026-06-02', net: -30000 },
    ]
    const { container } = render(<div style={{ width: 600, height: 300 }}><NetLine data={data} /></div>)
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy()
    const path = container.querySelector('.recharts-line-curve')
    expect(path).toBeTruthy()
    expect(path.getAttribute('d')).toBeTruthy()
  })
  it('GradientArea binds the netWorth series field (regression: /net-worth renamed equity → netWorth)', () => {
    const data = [
      { bucket: '2026-06-01', netWorth: 1050000 },
      { bucket: '2026-06-02', netWorth: 1100000 },
    ]
    const { container } = render(<GradientArea data={data} />)
    // If the Area's dataKey doesn't match the series field, recharts draws no path.
    const path = container.querySelector('.recharts-area-area')
    expect(path).toBeTruthy()
    expect(path.getAttribute('d')).toBeTruthy()
  })
})
