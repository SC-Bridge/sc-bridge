import { Lightbulb } from 'lucide-react'
import { useInvestmentOption } from '../hooks'
import { formatAUEC } from '../formatAUEC'

// Advisory only (Module3): hidden entirely when cash flow is neutral/negative.
export default function InvestmentBanner() {
  const { data } = useInvestmentOption()
  if (!data || !data.positive) return null
  return (
    <div className="panel p-4 border border-sc-success/30 flex items-center gap-3">
      <Lightbulb className="w-5 h-5 text-sc-success shrink-0" />
      <p className="text-sm text-gray-300">
        Based on positive cash flow, you have <span className="text-white">~{formatAUEC(data.surplus)}</span> available for reinvestment this period.
      </p>
    </div>
  )
}
