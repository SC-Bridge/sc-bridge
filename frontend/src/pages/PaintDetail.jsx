import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Palette, Rocket, AlertCircle } from 'lucide-react'
import { usePaintDetail } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import ShipImage from '../components/ShipImage'
import ItemImage from '../components/ItemImage'
import RenderViewer from '../components/RenderViewer'
import EmptyState from '../components/EmptyState'

export default function PaintDetail() {
  const { slug } = useParams()
  const decoded = slug ? decodeURIComponent(slug) : ''
  const { data, loading, error, refetch } = usePaintDetail(decoded)
  // The hull whose large view is open (an entry of data.hull_renders), or null.
  const [viewerHull, setViewerHull] = useState(null)

  if (loading) return <LoadingState message="Loading paint..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Link to="/paints" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Paints
        </Link>
        <EmptyState
          message="This paint couldn't be found."
          icon={AlertCircle}
          large
          actionLink={{ to: '/paints', label: 'Browse all paints' }}
        />
      </div>
    )
  }

  const hero = data.image_url || data.image_url_large || data.image_url_medium || data.image_url_small
  const hullRenders = data.hull_renders || []
  const renderBySlug = new Map(hullRenders.map(h => [h.vehicle_slug, h.render]))

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Link to="/paints" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Paints
      </Link>

      <PageHeader
        title={data.name}
        subtitle={data.manufacturer_name ? `by ${data.manufacturer_name}` : null}
        actions={
          <span className="text-[10px] font-display uppercase tracking-wide px-2 py-1 rounded bg-sc-accent/10 text-sc-accent border border-sc-accent/30 flex items-center gap-1.5">
            <Palette className="w-3 h-3" />
            Paint
          </span>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6">
        {/* Hero image */}
        <div className="rounded-lg overflow-hidden border border-sc-border bg-sc-darker">
          {hero || data.render ? (
            <ItemImage
              render={data.render}
              size={2048}
              src={hero}
              alt={data.name}
              aspectRatio="landscape"
              onOpen={hullRenders.length > 0 ? () => setViewerHull(hullRenders[0]) : undefined}
            />
          ) : (
            <div className="aspect-[4/3] flex items-center justify-center text-gray-600 text-xs font-mono uppercase tracking-wider">
              No image available
            </div>
          )}
        </div>

        {/* Right column: description + compatible ships */}
        <div className="space-y-5">
          {data.description && (
            <section>
              <h2 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Description</h2>
              <p className="text-sm text-gray-300 whitespace-pre-line">{data.description}</p>
            </section>
          )}

          {hullRenders.length > 0 && (
            <section>
              <h2 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">
                On each hull
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {hullRenders.map(h => (
                  <figure key={h.vehicle_slug} className="border border-sc-border rounded overflow-hidden bg-sc-darker">
                    <ItemImage
                      render={h.render}
                      alt={`${data.name} on ${h.vehicle_name}`}
                      aspectRatio="landscape"
                      onOpen={() => setViewerHull(h)}
                    />
                    <figcaption className="px-2 py-1 text-[11px] text-gray-300 truncate">{h.vehicle_name}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">
              Fits {data.vehicles.length} ship{data.vehicles.length !== 1 ? 's' : ''}
            </h2>
            {data.vehicles.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No ships linked to this paint in the current data.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.vehicles.map(v => (
                  <Link
                    key={v.id}
                    to={`/ships/${v.slug}`}
                    className="flex items-center gap-3 px-3 py-2 border border-sc-border rounded hover:border-sc-accent/40 hover:bg-white/5 transition-colors"
                  >
                    {v.image_url || renderBySlug.has(v.slug) ? (
                      <ShipImage
                        render={renderBySlug.get(v.slug)}
                        src={v.image_url}
                        alt={v.name}
                        aspectRatio="thumbnail-sm"
                        className="rounded border border-sc-border/50 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-8 rounded bg-sc-darker flex items-center justify-center shrink-0">
                        <Rocket className="w-3.5 h-3.5 text-gray-600" />
                      </div>
                    )}
                    <span className="text-xs text-gray-200 truncate">{v.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {data.class_name && (
            <section>
              <h2 className="text-[10px] font-display uppercase tracking-widest text-gray-500 mb-2">Technical</h2>
              <dl className="text-[11px] font-mono text-gray-400 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                <dt>Class</dt><dd>{data.class_name}</dd>
                <dt>Slug</dt><dd>{data.slug}</dd>
                {data.uuid && <><dt>UUID</dt><dd className="truncate">{data.uuid}</dd></>}
              </dl>
            </section>
          )}
        </div>
      </div>

      {viewerHull && (
        <RenderViewer
          kind="vehicle"
          itemKey={viewerHull.item_key}
          initialVariant={data.class_name?.toLowerCase() ?? ''}
          title={`${data.name} on ${viewerHull.vehicle_name}`}
          onClose={() => setViewerHull(null)}
        />
      )}
    </div>
  )
}
