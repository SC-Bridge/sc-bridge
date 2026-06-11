import '@testing-library/jest-dom'

// ResizeObserver is not implemented in jsdom. Recharts' ResponsiveContainer requires
// it at mount time — stub it so chart tests don't throw in the test environment.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
