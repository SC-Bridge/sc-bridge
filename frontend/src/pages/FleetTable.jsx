import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFleet, useUserOrgs, updateShipVisibility } from '../hooks/useAPI'
import { ArrowUpDown, SearchX } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import FilterSelect from '../components/FilterSelect'
import SearchInput from '../components/SearchInput'
import InsuranceBadge from '../components/InsuranceBadge'
import ShipImage from '../components/ShipImage'
import ShipDetailPanel from '../components/ShipDetailPanel'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'org', label: 'Org' },
  { value: 'officers', label: 'Officers' },
  { value: 'public', label: 'Public' },
]

export default function FleetTable() {
  const { data: fleet, loading, error, refetch } = useFleet()
  const { data: orgsData } = useUserOrgs()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortKey, setSortKey] = useState('vehicle_name')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('all')

  const selectedId = searchParams.get('ship') ? Number(searchParams.get('ship')) : null
  const setSelectedId = useCallback((id) => {
    setSearchParams((prev) => {
      if (id == null) { prev.delete('ship'); return prev }
      prev.set('ship', String(id))
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const inOrgs = !!(orgsData?.orgs?.length > 0)

  const sizes = useMemo(() => {
    if (!fleet) return []
    const s = new Set(fleet.map((v) => v.size_label || 'Unknown'))
    return ['all', ...Array.from(s).sort()]
  }, [fleet])

  const sorted = useMemo(() => {
    if (!fleet) return []
    let items = [...fleet]

    if (filter) {
      const f = filter.toLowerCase()
      items = items.filter(
        (v) =>
          v.vehicle_name?.toLowerCase().includes(f) ||
          v.custom_name?.toLowerCase().includes(f) ||
          v.manufacturer_name?.toLowerCase().includes(f) ||
          v.focus?.toLowerCase().includes(f)
      )
    }

    if (sizeFilter !== 'all') {
      items = items.filter((v) => (v.size_label || 'Unknown') === sizeFilter)
    }

    items.sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'vehicle_name': va = a.vehicle_name; vb = b.vehicle_name; break
        case 'size': va = a.size_label || ''; vb = b.size_label || ''; break
        case 'focus': va = a.focus || ''; vb = b.focus || ''; break
        case 'pledge': va = a.pledge_price || 0; vb = b.pledge_price || 0; break
        default: va = a.vehicle_name; vb = b.vehicle_name
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return items
  }, [fleet, filter, sizeFilter, sortKey, sortDir])

  // Reset selection when filters change
  useEffect(() => {
    setSelectedId(null)
  }, [filter, sizeFilter])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const clearFilters = () => {
    setFilter('')
    setSizeFilter('all')
  }

  const selectedShip = selectedId != null ? sorted.find((v) => (v.id || v.vehicle_id) === selectedId) : null

  // Close detail panel on Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && selectedId != null) {
      setSelectedId(null)
    }
  }, [selectedId])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (loading) return <LoadingState message="Loading fleet..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="MY FLEET"
        actions={<span className="text-xs font-mono text-gray-500">{sorted.length} vehicles</span>}
      />

      <div className="flex gap-3 items-center">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Search ships..."
          className="flex-1 max-w-sm"
        />
        <FilterSelect
          value={sizeFilter}
          onChange={(e) => setSizeFilter(e.target.value)}
          options={sizes}
          allLabel="All Sizes"
        />
      </div>

      <div className="fleet-layout">
        {/* Master: Ship List */}
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Your fleet ships — click a row to see details</caption>
              <thead>
                <tr className="bg-sc-darker/50">
                  {[
                    { key: 'vehicle_name', label: 'Ship' },
                    { key: 'size', label: 'Size' },
                    { key: 'focus', label: 'Role' },
                    { key: 'pledge', label: 'Pledge $' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      scope="col"
                      className="table-header cursor-pointer hover:text-gray-300 select-none"
                      onClick={() => toggleSort(key)}
                      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        <ArrowUpDown className={`w-3 h-3 ${sortKey === key ? 'text-sc-accent' : 'text-gray-500'}`} aria-hidden="true" />
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="table-header">Insurance</th>
                  {inOrgs && <th scope="col" className="table-header">Visibility</th>}
                  {inOrgs && <th scope="col" className="table-header">Ops</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={inOrgs ? 7 : 5} className="py-12">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <SearchX className="w-10 h-10 text-gray-500" />
                        <p className="text-gray-500 text-sm">No ships match your filters</p>
                        <button onClick={clearFilters} className="btn-secondary text-xs">
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sorted.map((v, i) => {
                    const rowId = v.id || v.vehicle_id
                    const isSelected = selectedId === rowId
                    return (
                    <tr
                      key={rowId || i}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${isSelected ? 'fleet-row-selected' : ''}`}
                      onClick={() => setSelectedId(rowId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(rowId) }
                        if (e.key === 'ArrowDown') { e.preventDefault(); const next = e.currentTarget.nextElementSibling; if (next) next.focus() }
                        if (e.key === 'ArrowUp') { e.preventDefault(); const prev = e.currentTarget.previousElementSibling; if (prev) prev.focus() }
                      }}
                      tabIndex={0}
                      role="row"
                      aria-selected={isSelected}
                      aria-label={`View details for ${v.vehicle_name}${v.custom_name ? ` "${v.custom_name}"` : ''}`}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <ShipImage
                            src={v.image_url}
                            alt={v.vehicle_name}
                            aspectRatio="thumbnail"
                            className="rounded border border-sc-border/50 shrink-0"
                          />
                          <div>
                            <span className="font-medium text-white">{v.vehicle_name}</span>
                            {v.custom_name && (
                              <span className="block text-xs text-gray-500 italic">"{v.custom_name}"</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="badge badge-size">{v.size_label || '?'}</span>
                      </td>
                      <td className="table-cell text-gray-400">{v.focus || '-'}</td>
                      <td className="table-cell font-mono text-gray-400">
                        {v.pledge_price ? `$${v.pledge_price}` : '-'}
                      </td>
                      <td className="table-cell">
                        <InsuranceBadge isLifetime={v.is_lifetime} label={v.insurance_label} />
                      </td>
                      {inOrgs && (
                        <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={v.org_visibility || 'private'}
                            onChange={async (e) => {
                              await updateShipVisibility(v.id, { org_visibility: e.target.value }).catch(() => {})
                              refetch()
                            }}
                            className="text-xs bg-sc-darker border border-sc-border rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-sc-accent"
                            title="Org visibility for this ship"
                          >
                            {VISIBILITY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {inOrgs && (
                        <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!v.available_for_ops}
                            onChange={async (e) => {
                              await updateShipVisibility(v.id, { available_for_ops: e.target.checked }).catch(() => {})
                              refetch()
                            }}
                            title="Available for ops"
                            className="accent-sc-accent cursor-pointer"
                          />
                        </td>
                      )}
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail: Ship Info Panel */}
        {selectedShip && (
          <ShipDetailPanel
            ship={selectedShip}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
