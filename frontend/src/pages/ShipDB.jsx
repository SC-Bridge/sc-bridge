import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useShips } from '../hooks/useAPI'
import { Database, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Ruler, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import CommunityTools from '../components/CommunityTools'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import FilterSelect from '../components/FilterSelect'
import SearchInput from '../components/SearchInput'
import ShipImage from '../components/ShipImage'
import StatusBadge from '../components/StatusBadge'
import SizeLineup from './Ships/SizeLineup'

const PAGE_SIZE = 30
/** The most ships the size lineup draws at once; picking another drops the oldest. */
const MAX_COMPARE = 8

export default function ShipDB() {
  const { data: ships, loading, error, refetch } = useShips()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('q') || ''
  const mfrFilter = searchParams.get('mfr') || 'all'
  const sizeFilter = searchParams.get('size') || 'all'
  const classFilter = searchParams.get('class') || 'all'
  const statusFilter = searchParams.get('status') || 'all'
  const sortBy = searchParams.get('sort') || 'name'
  const sortDir = searchParams.get('dir') || 'asc'
  const page = parseInt(searchParams.get('page') || '1', 10)
  // Ships picked for the size lineup, in the URL so a comparison can be shared.
  const compareSlugs = (searchParams.get('cmp') || '').split(',').filter(Boolean)
  const setCompare = (slugs) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (slugs.length) { next.set('cmp', slugs.join(',')) } else { next.delete('cmp') }
    return next
  }, { replace: true })
  const toggleCompare = (slug) => setCompare(
    compareSlugs.includes(slug) ? compareSlugs.filter((s) => s !== slug) : [...compareSlugs, slug].slice(-MAX_COMPARE),
  )

  const setFilter = (val) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (val) { next.set('q', val) } else { next.delete('q') }
      next.set('page', '1')
      return next
    }, { replace: true })
  }
  const setMfrFilter = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('mfr', val); next.set('page', '1'); return next }, { replace: true })
  const setSizeFilter = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('size', val); next.set('page', '1'); return next }, { replace: true })
  const setClassFilter = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('class', val); next.set('page', '1'); return next }, { replace: true })
  const setStatusFilter = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('status', val); next.set('page', '1'); return next }, { replace: true })
  const setSortBy = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('sort', val); return next }, { replace: true })
  const setSortDir = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('dir', val); return next }, { replace: true })
  const setPage = (val) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('page', String(typeof val === 'function' ? val(page) : val)); return next }, { replace: true })

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

  const handleFilterChange = (setter) => (e) => setter(e.target.value)
  const handleSearchChange = (val) => setFilter(val)

  const compareShips = compareSlugs.map((slug) => ships?.find((s) => s.slug === slug)).filter(Boolean)

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

      {compareShips.length > 0 && (
        <section data-testid="size-compare" className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-wider text-gray-300 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-sc-accent" /> Compare sizes
            </h2>
            <button onClick={() => setCompare([])} className="btn-secondary flex items-center gap-1.5 text-xs">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
          <SizeLineup ships={compareShips} />
        </section>
      )}

      {/* Ship Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {paged.map((ship) => {
          const picked = compareSlugs.includes(ship.slug)
          return (
            <div key={ship.slug} className="relative">
              {/* A sibling of the card link, not inside it: a button cannot sit in a link. */}
              <button
                type="button"
                onClick={() => toggleCompare(ship.slug)}
                aria-pressed={picked}
                aria-label={`Compare size: ${ship.name}`}
                title={picked ? 'Remove from size comparison' : 'Compare size'}
                className={`absolute top-2 right-2 z-10 p-1.5 rounded border transition-colors ${picked ? 'bg-sc-accent/20 border-sc-accent/60 text-sc-accent' : 'bg-sc-darker/70 border-sc-border text-gray-400 hover:text-sc-accent'}`}
              >
                <Ruler className="w-3.5 h-3.5" />
              </button>
              <Link to={`/ships/${ship.slug}`} className="panel-hover group cursor-pointer overflow-hidden block">
                <ShipImage
                  render={ship.render}
                  src={ship.image_url_small}
                  fallbackSrc={ship.image_url_medium || ship.image_url}
                  baseSrc={baseImageMap.get(ship.slug)}
                  alt={ship.name}
                  aspectRatio="landscape"
                  hoverZoom
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 min-h-[3.75rem] mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-white text-sm line-clamp-2 leading-tight">{ship.name}</h3>
                      <span className="text-xs text-gray-400 mt-1 block">{ship.manufacturer_name}</span>
                    </div>
                    <span className="badge badge-size shrink-0">{ship.size_label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono text-gray-400 mt-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-sc-accent2 block">Role</span>
                      <span className="block truncate">{ship.focus || '-'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sc-accent2 block">Cargo</span>
                      <span className="block truncate">{ship.cargo > 0 ? `${ship.cargo} SCU` : '-'}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sc-accent2 block">Crew</span>
                      <span className="block truncate">{
                        ship.crew_min != null && ship.crew_max != null
                          ? (ship.crew_min === ship.crew_max ? `${ship.crew_min}` : `${ship.crew_min}-${ship.crew_max}`)
                          : '-'
                      }</span>
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
            </div>
          )
        })}
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

      <CommunityTools />
    </div>
  )
}
