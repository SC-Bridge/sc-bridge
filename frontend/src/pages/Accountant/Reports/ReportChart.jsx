import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../../../lib/theme'

const AXIS = { stroke: '#6b7280', fontSize: 11 }

export function GroupedBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis dataKey="bucket" {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="in" fill={CHART_COLORS[3]} />
        <Bar dataKey="out" fill={CHART_COLORS[2]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoryDonut({ data, colors }) {
  // `colors` overrides the categorical palette when segments carry a semantic
  // meaning (e.g. Assets vs Liabilities → success/danger).
  const palette = colors ?? CHART_COLORS
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function GradientArea({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.6} />
            <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis dataKey="bucket" {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Area type="monotone" dataKey="netWorth" stroke={CHART_COLORS[0]} fill="url(#nwfill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// NetLine — single net-value line chart (no bars; named for what it renders).
export function NetLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis dataKey="bucket" {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="net" stroke={CHART_COLORS[0]} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
