// Recharts can't use CSS vars in SVG fill, so JS constants are needed
export const CHART_COLORS = [
  '#22d3ee', // sc-accent (cyan)
  '#a78bfa', // violet / sc-lti
  '#f5a623', // sc-warn (amber)
  '#2ec4b6', // sc-success (teal)
  '#ec4899', // pink
  '#5b9bd5', // sc-accent2 (blue)
  '#818cf8', // indigo
  '#6366f1', // indigo deeper
]

// Semantic chart fills mirroring the sc-success / sc-danger Tailwind tokens
// (Recharts SVG fills can't reference CSS vars). Use when a chart's segments
// carry a good/bad meaning rather than being an arbitrary categorical series.
export const CHART_SEMANTIC = { positive: '#2ec4b6', negative: '#ef4444' }

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#132238',
    border: '1px solid #1e3a5f',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  labelStyle: {
    color: '#9ca3af',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
  },
  itemStyle: {
    color: '#d1d5db',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
  },
}
