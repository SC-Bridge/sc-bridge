const TONE_CLASS = {
  positive: 'text-sc-success',
  negative: 'text-sc-danger',
  neutral: 'text-white',
}

// Pure presentational summary card row.
// cards: [{ label, value, sub?, tone?: 'positive' | 'negative' | 'neutral' }]
export default function SummaryCards({ cards }) {
  return (
    <div className="flex gap-4" data-testid="summary-cards">
      {cards.map(({ label, value, sub, tone }) => (
        <div key={label} className="flex-1 panel p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
          <p className={`text-lg font-semibold ${TONE_CLASS[tone] ?? 'text-white'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
      ))}
    </div>
  )
}
