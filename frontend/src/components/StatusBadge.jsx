import { CheckCircle, Wrench, Lightbulb } from 'lucide-react'

const STATUS_CONFIG = {
  flight_ready: { icon: CheckCircle, color: 'text-sc-success', label: 'Flight Ready' },
  in_production: { icon: Wrench, color: 'text-sc-warn', label: 'In Production' },
  in_concept: { icon: Lightbulb, color: 'text-blue-400', label: 'In Concept' },
}

export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status] || { icon: Wrench, color: 'text-sc-warn', label: status }
  const Icon = cfg.icon
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
  const gap = size === 'sm' ? 'gap-1' : 'gap-1.5'

  return (
    <span className={`inline-flex items-center ${gap} ${cfg.color} font-mono ${textSize}`}>
      <Icon className={iconSize} />
      {cfg.label}
    </span>
  )
}
