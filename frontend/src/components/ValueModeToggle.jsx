import useValueMode from '../hooks/useValueMode'

/**
 * Switches money between what was pledged and what it would melt for.
 *
 * Renders nothing when `available` is false — an account with no pledge rows
 * has no reclaimable data, and a toggle that flips to a confident $0 would be
 * worse than no toggle at all.
 */
export default function ValueModeToggle({ available = true, size = 'md' }) {
  const { valueMode, setValueMode } = useValueMode()
  if (!available) return null

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'

  return (
    <div
      role="group"
      aria-label="Show values as"
      className="inline-flex rounded border border-sc-border overflow-hidden shrink-0"
    >
      {[
        { key: 'pledge', label: 'Pledge' },
        { key: 'melt', label: 'Melt' },
      ].map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={valueMode === key}
          onClick={() => setValueMode(key)}
          className={`${pad} font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sc-accent ${
            valueMode === key
              ? 'bg-sc-accent/15 text-sc-accent'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
