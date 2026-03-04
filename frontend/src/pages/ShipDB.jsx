import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useShips } from '../hooks/useAPI'
import { Database, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import FilterSelect from '../components/FilterSelect'
import SearchInput from '../components/SearchInput'
import ShipImage from '../components/ShipImage'
import StatusBadge from '../components/StatusBadge'

const PAGE_SIZE = 30

export default function ShipDB() {
  const { data: ships, loading, error, refetch } = useShips()
  const [filter, setFilter] = useState('')
  const [mfrFilter, setMfrFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  // For ships with no valid absolute image URL, find the base variant's image by
  // progressively shortening the ship name and looking for a match that has one.
  // Relative-path URLs (old RSI CDN format, missing domain prefix) are treated as
  // invalid so those ships also get the name-prefix fallback.
  const baseImageMap = useMemo(() => {
    if (!ships) return new Map()
    const bestAbsolute = (s) => {
      for (const url of [s.image_url_small, s.image_url_medium, s.image_url]) {
        if (url?.startsWith('http')) return url
      }
      return null
    }
    const withImages = ships
      .filter((s) => bestAbsolute(s) !== null)
      .map((s) => ({ name: s.name.toLowerCase(), img: bestAbsolute(s) }))
    const result = new Map()
    for (const ship of ships) {
      if (bestAbsolute(ship) !== null) continue
      const words = ship.name.toLowerCase().split(/\s+/)
      for (let len = words.length - 1; len >= 1; len--) {
        const prefix = words.slice(0, len).join(' ')
        const base = withImages.find((b) => b.name === prefix)
        if (base) {
          result.set(ship.slug, base.img)
          break
        }
      }
    }
    return result
  }, [ships])

  const manufacturers = useMemo(() => {
    if (!ships) return []
    const m = new Set(ships.map((s) => s.manufacturer_name).filter(Boolean))
    return ['all', ...Array.from(m).sort()]
  }, [ships])

  const sizes = useMemo(() => {
    if (!ships) return []
    const s = new Set(ships.map((s) => s.size_label).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [ships])

  const classifications = useMemo(() => {
    if (!ships) return []
    const c = new Set(ships.map((s) => s.classification).filter(Boolean))
    return ['all', ...Array.from(c).sort()]
  }, [ships])

  const statuses = useMemo(() => {
    if (!ships) return []
    const s = new Set(ships.map((s) => s.production_status).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [ships])

  const filtered = useMemo(() => {
    if (!ships) return []
    let items = [...ships]

    if (filter) {
      const f = filter.toLowerCase()
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(f) ||
          s.manufacturer_name?.toLowerCase().includes(f) ||
          s.focus?.toLowerCase().includes(f)
      )
    }

    if (mfrFilter !== 'all') items = items.filter((s) => s.manufacturer_name === mfrFilter)
    if (sizeFilter !== 'all') items = items.filter((s) => s.size_label === sizeFilter)
    if (classFilter !== 'all') items = items.filter((s) => s.classification === classFilter)
    if (statusFilter !== 'all') items = items.filter((s) => s.production_status === statusFilter)

    items.sort((a, b) => {
      let va, vb
      switch (sortBy) {
        case 'name': va = a.name; vb = b.name; break
        case 'price':
          va = a.acquisition_type === 'ingame_shop' ? (a.price_auec || 0) : (a.pledge_price || 0);
          vb = b.acquisition_type === 'ingame_shop' ? (b.price_auec || 0) : (b.pledge_price || 0);
          break
        case 'cargo': va = a.cargo || 0; vb = b.cargo || 0; break
        default: va = a.name; vb = b.name
      }

      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return items
  }, [ships, filter, mfrFilter, sizeFilter, classFilter, statusFilter, sortBy, sortDir])

  // Scroll to top after page changes, but not on initial mount
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    window.scrollTo(0, 0)
  }, [page])

  // Page jump input — local state keeps the input responsive; syncs when page changes externally
  const [inputPage, setInputPage] = useState('1')
  useEffect(() => { setInputPage(String(page)) }, [page])
  const handlePageJump = () => {
    const n = parseInt(inputPage, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n)
    } else {
      setInputPage(String(page))
    }
  }

  const resetPage = () => setPage(1)
  const handleFilterChange = (setter) => (e) => { setter(e.target.value); resetPage() }
  const handleSearchChange = (e) => { setFilter(e.target.value); resetPage() }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return <LoadingState message="Loading ship database..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="SHIP DATABASE"
        subtitle={`${ships?.length || 0} ships synced from SC Wiki`}
        actions={<Database className="w-5 h-5 text-gray-500" />}
      />

      <SearchInput
        value={filter}
        onChange={handleSearchChange}
        placeholder="Search ships..."
        className="max-w-md"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <FilterSelect value={mfrFilter} onChange={handleFilterChange(setMfrFilter)} options={manufacturers} allLabel="All Manufacturers" />
        <FilterSelect value={classFilter} onChange={handleFilterChange(setClassFilter)} options={classifications} allLabel="All Classes" />
        <FilterSelect value={sizeFilter} onChange={handleFilterChange(setSizeFilter)} options={sizes} allLabel="All Sizes" />
        <FilterSelect value={statusFilter} onChange={handleFilterChange(setStatusFilter)} options={statuses} allLabel="All Statuses" />
        <FilterSelect
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          options={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'price', label: 'Sort: Price' },
            { value: 'cargo', label: 'Sort: Cargo' },
          ]}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortDir === 'asc' ? 'Ascending' : 'Descending'}
        </button>
        <span className="text-xs font-mono text-gray-500">{filtered.length} results</span>
      </div>

      {/* Ship Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {paged.map((ship) => (
          <Link key={ship.slug} to={`/ships/${ship.slug}`} className="panel-hover group cursor-pointer overflow-hidden block">
            <ShipImage
              src={ship.image_url_small}
              fallbackSrc={ship.image_url_medium || ship.image_url}
              baseSrc={baseImageMap.get(ship.slug)}
              alt={ship.name}
              aspectRatio="landscape"
              hoverZoom
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 h-14 overflow-hidden mb-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-white text-sm line-clamp-2">{ship.name}</h3>
                  <span className="text-xs text-gray-400">{ship.manufacturer_name}</span>
                </div>
                <span className="badge badge-size shrink-0">{ship.size_label}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono text-gray-400 mt-3">
                <div>
                  <span className="font-semibold text-sc-accent2 block">Role</span>
                  {ship.focus || '-'}
                </div>
                <div>
                  <span className="font-semibold text-sc-accent2 block">Cargo</span>
                  {ship.cargo > 0 ? `${ship.cargo} SCU` : '-'}
                </div>
                <div>
                  <span className="font-semibold text-sc-accent2 block">Crew</span>
                  {ship.min_crew}-{ship.max_crew}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-sc-border/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ship.pledge_price > 0 ? (
                      <span className="text-xs font-mono text-sc-warn">${ship.pledge_price} USD</span>
                    ) : (ship.acquisition_type === 'ingame_quest' || ship.acquisition_type === 'ingame_cz') ? (
                      <span className="text-xs text-sc-accent2">Quest Reward</span>
                    ) : null}
                    {ship.price_auec > 0 && ship.pledge_price > 0 && (
                      <span className="text-xs text-gray-400">|</span>
                    )}
                    {ship.price_auec > 0 && (
                      <span className="text-xs font-mono text-sc-melt">{ship.price_auec.toLocaleString()} aUEC</span>
                    )}
                  </div>
                  <StatusBadge status={ship.production_status} size="sm" />
                </div>
                <div className="mt-1 min-h-[1rem]">
                  {(ship.acquisition_type === 'ingame_quest' || ship.acquisition_type === 'ingame_cz') && ship.acquisition_source_name && (
                    <span className="text-xs text-sc-accent2">{ship.acquisition_source_name}</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="btn-secondary p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500 px-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={handlePageJump}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump()}
              className="w-10 text-center bg-sc-darker border border-sc-border rounded px-1 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-sc-accent"
            />
            <span>of {totalPages}</span>
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="btn-secondary p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
