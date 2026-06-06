import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { useSalvageableShips } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'
import ShipImage from '../components/ShipImage'
import { collectVariantTypes, filterSalvageableShips, variantLabel } from './salvageableHelpers'

export default function Salvageable() {
  const { data: ships, loading, error, refetch } = useSalvageableShips()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const variant = searchParams.get('variant') || 'all'

  const setSearch = (val) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (val) next.set('q', val); else next.delete('q')
    return next
  }, { replace: true })

  const setVariant = (val) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (val && val !== 'all') next.set('variant', val); else next.delete('variant')
    return next
  }, { replace: true })

  const variantTypes = useMemo(() => collectVariantTypes(ships), [ships])
  const filtered = useMemo(
    () => filterSalvageableShips(ships, { search, variant }),
    [ships, search, variant],
  )

  if (loading) return <LoadingState message="Loading salvageable ships..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="SALVAGEABLE SHIPS"
        subtitle={`${ships?.length || 0} ships with salvageable variants`}
        actions={<Wrench className="w-5 h-5 text-gray-500" />}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search salvageable ships..."
        className="max-w-md"
      />

      {variantTypes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            onClick={() => setVariant('all')}
            className={`px-2.5 py-1 text-[10px] font-display uppercase tracking-wide rounded border transition-colors ${
              variant === 'all'
                ? 'text-sc-accent border-sc-accent/40 bg-sc-accent/10'
                : 'text-gray-500 border-sc-border hover:text-gray-300'
            }`}
          >
            All ({ships?.length || 0})
          </button>
          {variantTypes.map((vt) => (
            <button
              key={vt}
              onClick={() => setVariant(variant === vt ? 'all' : vt)}
              className={`px-2.5 py-1 text-[10px] font-display uppercase tracking-wide rounded border transition-colors ${
                variant === vt
                  ? 'text-sc-accent border-sc-accent/40 bg-sc-accent/10'
                  : 'text-gray-500 border-sc-border hover:text-gray-300'
              }`}
            >
              {variantLabel(vt)}
            </button>
          ))}
        </div>
      )}

      <div className="text-xs font-mono text-gray-500">{filtered.length} results</div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((ship) => (
          <Link
            key={ship.slug}
            to={`/ships/${ship.slug}?tab=salvage`}
            className="panel-hover group cursor-pointer overflow-hidden block"
          >
            <ShipImage
              src={ship.image_url_small}
              alt={ship.name}
              aspectRatio="landscape"
              hoverZoom
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-white text-sm line-clamp-2 leading-tight">{ship.name}</h3>
                  <span className="text-xs text-gray-400 mt-1 block">{ship.manufacturer_name}</span>
                </div>
                <span className="badge badge-size shrink-0">
                  {ship.variant_count} variant{ship.variant_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-3 pt-2 border-t border-sc-border/30 flex flex-wrap gap-1.5">
                {(ship.variant_types || '').split(',').map((s) => s.trim()).filter(Boolean).map((vt) => (
                  <span key={vt} className="text-[10px] font-display uppercase tracking-wide px-1.5 py-0.5 rounded border border-sc-accent2/30 text-sc-accent2 bg-sc-accent2/10">
                    {variantLabel(vt)}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-500 font-mono text-sm">
          No salvageable ships match your filters.
        </div>
      )}
    </div>
  )
}
