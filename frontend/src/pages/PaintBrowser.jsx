import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Palette, LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { usePaints } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import FilterSelect from '../components/FilterSelect'
import SearchInput from '../components/SearchInput'

const PAGE_SIZE = 36

export default function PaintBrowser() {
  const { data: paints, loading, error, refetch } = usePaints()
  const [search, setSearch] = useState('')
  const [shipFilter, setShipFilter] = useState('all')
  const [view, setView] = useState('grid')
  const [page, setPage] = useState(1)

  // Build ship filter options from all paint vehicle associations
  const shipOptions = useMemo(() => {
    if (!paints) return []
    const ships = new Map()
    for (const p of paints) {
      for (const v of p.vehicles) {
        if (!ships.has(v.slug)) ships.set(v.slug, v.name)
      }
    }
    return [
      { value: 'all', label: 'All Ships' },
      ...Array.from(ships.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([slug, name]) => ({ value: slug, label: name })),
    ]
  }, [paints])

  const filtered = useMemo(() => {
    if (!paints) return []
    let result = paints

    if (shipFilter !== 'all') {
      result = result.filter((p) => p.vehicles.some((v) => v.slug === shipFilter))
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.vehicles.some((v) => v.name.toLowerCase().includes(q))
      )
    }

    return result
  }, [paints, search, shipFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset page when filters change
  const handleSearch = (v) => { setSearch(v); setPage(1) }
  const handleShipFilter = (e) => { setShipFilter(e.target.value); setPage(1) }

  if (loading) return <LoadingState variant="skeleton" />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!paints) return null

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="PAINTS"
        subtitle={`${filtered.length} paint${filtered.length !== 1 ? 's' : ''} across ${shipOptions.length - 1} ships`}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded transition-colors ${view === 'list' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-500 hover:text-gray-300'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded transition-colors ${view === 'grid' ? 'bg-sc-accent/20 text-sc-accent' : 'text-gray-500 hover:text-gray-300'}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={handleSearch}
          placeholder="Search paints..."
          className="flex-1"
        />
        <FilterSelect
          value={shipFilter}
          onChange={handleShipFilter}
          options={shipOptions}
          className="sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Palette className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-sm">No paints match your filters</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {paged.map((paint) => (
            <PaintCard key={paint.id} paint={paint} />
          ))}
        </div>
      ) : (
        <div className="panel divide-y divide-sc-border/30">
          {paged.map((paint) => (
            <PaintRow key={paint.id} paint={paint} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-gray-400">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <PaginationBtn onClick={() => setPage(1)} disabled={safePage <= 1}><ChevronsLeft className="w-3.5 h-3.5" /></PaginationBtn>
            <PaginationBtn onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}><ChevronLeft className="w-3.5 h-3.5" /></PaginationBtn>
            <span className="px-3 py-1.5">{safePage} / {totalPages}</span>
            <PaginationBtn onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages}><ChevronRight className="w-3.5 h-3.5" /></PaginationBtn>
            <PaginationBtn onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}><ChevronsRight className="w-3.5 h-3.5" /></PaginationBtn>
          </div>
        </div>
      )}
    </div>
  )
}

function PaintCard({ paint }) {
  const thumb = paint.image_url_medium || paint.image_url_small || paint.image_url
  const shipNames = paint.vehicles.map((v) => v.name).join(', ')

  return (
    <div className="bg-sc-panel border border-sc-border/40 rounded overflow-hidden group hover:border-sc-accent/40 transition-colors">
      <div className="aspect-square flex items-center justify-center bg-sc-darker/50">
        {thumb ? (
          <img src={thumb} alt={paint.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <Palette className="w-8 h-8 text-gray-600" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-xs font-mono text-gray-200 truncate" title={paint.name}>{paint.name}</p>
        {paint.vehicles.length > 0 && (
          <p className="text-[10px] text-gray-500 truncate" title={shipNames}>
            {paint.vehicles.length === 1 ? (
              <Link to={`/ships/${paint.vehicles[0].slug}`} className="hover:text-sc-accent transition-colors">{paint.vehicles[0].name}</Link>
            ) : (
              `${paint.vehicles.length} ships`
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function PaintRow({ paint }) {
  const thumb = paint.image_url_small || paint.image_url_medium || paint.image_url

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="shrink-0 w-14 h-14 rounded overflow-hidden bg-sc-darker/50 border border-sc-border/40 flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt={paint.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Palette className="w-5 h-5 text-gray-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-mono text-gray-200">{paint.name}</p>
        {paint.vehicles.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            {paint.vehicles.map((v) => (
              <Link
                key={v.slug}
                to={`/ships/${v.slug}`}
                className="text-xs text-gray-500 hover:text-sc-accent transition-colors"
              >
                {v.name}
              </Link>
            ))}
          </div>
        )}
        {paint.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{paint.description}</p>
        )}
      </div>
    </div>
  )
}

function PaginationBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 border border-sc-border rounded text-gray-400 hover:text-white hover:border-sc-accent/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  )
}
