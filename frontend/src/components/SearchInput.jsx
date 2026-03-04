import { Search, X } from 'lucide-react'

export default function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
  const handleChange = (e) => onChange(e.target.value)
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        aria-label={placeholder}
        className="w-full bg-sc-panel border border-sc-border rounded pl-10 pr-9 py-2.5 text-sm font-mono text-gray-300 placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sc-panel focus:border-sc-accent/50 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
