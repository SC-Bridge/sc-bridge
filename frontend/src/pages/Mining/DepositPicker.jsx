import React, { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { friendlyElementName } from './miningUtils'

export default function DepositPicker({ compositions, value, onChange }) {
  const depositNames = useMemo(() => {
    const s = new Set()
    for (const c of compositions ?? []) {
      if (c.deposit_name) s.add(c.deposit_name)
    }
    return [...s].sort()
  }, [compositions])

  const variantsForDeposit = useMemo(() => {
    if (!value?.depositName) return []
    return (compositions ?? []).filter((c) => c.deposit_name === value.depositName)
  }, [compositions, value?.depositName])

  const dominantElementOptions = useMemo(() => {
    return variantsForDeposit.map((c) => {
      const m = c.name?.match(/_([A-Za-z][a-z]+)$/i)
      return { uuid: c.uuid, element: m ? m[1] : null, name: c.name }
    })
  }, [variantsForDeposit])

  return (
    <div className="space-y-3">
      <CustomSelect
        label="Rock"
        value={value?.depositName ?? ''}
        placeholder="Select a rock you scanned..."
        options={[
          { value: '', label: 'Select a rock you scanned...' },
          ...depositNames.map((n) => ({ value: n, label: n })),
        ]}
        onChange={(name) => onChange({ depositName: name || null, compositionUuid: null })}
      />

      {value?.depositName && (
        <CustomSelect
          label="Dominant element (optional)"
          value={value.compositionUuid ?? ''}
          placeholder="All variants (generic)"
          options={[
            { value: '', label: 'All variants (generic)' },
            ...dominantElementOptions
              .filter((o) => o.element)
              .map((o) => ({ value: o.uuid, label: friendlyElementName(o.element) })),
          ]}
          onChange={(uuid) => onChange({ ...value, compositionUuid: uuid || null })}
        />
      )}
    </div>
  )
}

function CustomSelect({ label, value, onChange, options, placeholder }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!open) return
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const selected = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-200 cursor-pointer ${
          open
            ? 'bg-white/[0.06] border border-sc-accent/40'
            : 'bg-white/[0.03] border border-white/[0.08]'
        }`}
      >
        <span className={selected?.value ? 'text-gray-200' : 'text-gray-500'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-gray-800/95 backdrop-blur-md border border-white/[0.1] shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-xs ${
                opt.value === value
                  ? 'bg-sc-accent/10 text-sc-accent'
                  : 'text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
