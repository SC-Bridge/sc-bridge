import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GroupedBars, CategoryDonut } from './ReportChart'

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
})
