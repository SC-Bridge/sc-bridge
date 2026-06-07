import { Plus, Package } from 'lucide-react'

/**
 * "Made N" stepper for a saved build (#90). A build is your tuned version of a
 * blueprint — you can't *collect* it (it's site-only), but you can *craft* N of
 * it in-game, so it gets a Made count instead of a Collected one. Emerald-tinted
 * to match the crafted/made badge used elsewhere.
 */
export default function MadeStepper({ qty, onSetQty }) {
  if (qty === 0) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onSetQty(1) }}
        className="flex items-center gap-1 px-1.5 h-5 rounded border border-emerald-500/40 text-emerald-300/80 hover:bg-emerald-500/10 hover:text-emerald-200 transition-all shrink-0 text-[10px] font-mono"
        title="Mark made"
        aria-label="Mark made"
      >
        <Package className="w-3 h-3" /> Made
      </button>
    )
  }
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); onSetQty(qty - 1) }}
        className="w-5 h-5 rounded border border-emerald-500/40 flex items-center justify-center text-emerald-300 hover:bg-emerald-500/20 transition-all text-xs leading-none"
        title={qty === 1 ? 'Unmark made' : 'Decrease'}
        aria-label={qty === 1 ? 'Unmark made' : 'Decrease made count'}
      >−</button>
      <span className="text-[10px] font-mono text-emerald-300 min-w-[14px] text-center" title={`Made ${qty}`}>{qty}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onSetQty(qty + 1) }}
        className="w-5 h-5 rounded border border-emerald-500/40 flex items-center justify-center text-emerald-300 hover:bg-emerald-500/20 transition-all"
        title="Increase"
        aria-label="Increase made count"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}
