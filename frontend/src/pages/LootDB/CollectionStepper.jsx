import { Plus } from 'lucide-react'

export default function CollectionStepper({ qty, onSetQty }) {
  if (qty === 0) {
    return (
      <button
        onClick={() => onSetQty(1)}
        className="w-5 h-5 rounded border border-gray-600 flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-300 transition-all shrink-0"
        title="Mark collected"
      >
        <Plus className="w-3 h-3" />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={() => onSetQty(qty - 1)}
        className="w-5 h-5 rounded border border-sc-accent/40 flex items-center justify-center text-sc-accent hover:bg-sc-accent/20 transition-all text-xs leading-none"
        title={qty === 1 ? 'Remove from collection' : 'Decrease'}
      >−</button>
      <span className="text-[10px] font-mono text-sc-accent min-w-[14px] text-center">{qty}</span>
      <button
        onClick={() => onSetQty(qty + 1)}
        className="w-5 h-5 rounded border border-sc-accent/40 flex items-center justify-center text-sc-accent hover:bg-sc-accent/20 transition-all"
        title="Increase"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}
