import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import InsuranceBadge from '../components/InsuranceBadge'
import StatusBadge from '../components/StatusBadge'
import ShipImage from '../components/ShipImage'

export default function PublicFleet() {
  const { handle } = useParams()
  const [retryCount, setRetryCount] = useState(0)
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    fetch(`/api/u/${encodeURIComponent(handle)}/fleet`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) {
          setState({ status: 'not-found', data: null, error: null })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', data: null, error: 'Unable to load fleet. Please try again.' })
          return
        }
        const data = await res.json()
        if (cancelled) return
        setState({ status: 'ok', data, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', data: null, error: 'Unable to load fleet. Please try again.' })
      })
    return () => {
      cancelled = true
    }
  }, [handle, retryCount])

  if (state.status === 'loading') return <LoadingState fullScreen />
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setRetryCount((c) => c + 1)} />

  if (state.status === 'not-found') {
    return (
      <div className="min-h-screen bg-sc-dark text-gray-100 p-8">
        <div className="max-w-2xl mx-auto text-center mt-24 space-y-4">
          <h1 className="font-display font-bold text-3xl tracking-wider text-white">
            No public fleet for "{handle}"
          </h1>
          <p className="text-gray-400 text-sm">
            This citizen hasn't shared a fleet, or their share link is private.
          </p>
          <p className="text-gray-400 text-sm">
            <Link to="/register" className="text-sc-accent hover:underline">
              Sign up
            </Link>{' '}
            to track your own fleet, or{' '}
            <Link to="/" className="text-sc-accent hover:underline">
              go to the SC Bridge home page
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  const { data } = state
  const ships = data?.ships ?? []

  return (
    <div className="min-h-screen bg-sc-dark text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <PageHeader
          title={`${data.handle}'s Fleet`}
          subtitle={`${ships.length} ${ships.length === 1 ? 'ship' : 'ships'} shared publicly`}
        />
        <p className="text-gray-400 text-sm">
          Read-only public view —{' '}
          <Link to="/register" className="text-sc-accent hover:underline">
            Sign up
          </Link>{' '}
          to track your own fleet, or{' '}
          <Link to="/login" className="text-sc-accent hover:underline">
            sign in
          </Link>
          .
        </p>

        {ships.length === 0 ? (
          <div className="panel p-12 text-center text-gray-500">
            This fleet has no ships yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ships.map((ship) => (
              <article
                key={ship.id}
                className="panel overflow-hidden"
              >
                <ShipImage
                  src={ship.paint_image_url_medium || ship.paint_image_url || ship.image_url}
                  alt={ship.vehicle_name}
                  aspectRatio="landscape"
                />
                <div className="p-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg text-white">{ship.vehicle_name}</h2>
                    {ship.production_status && (
                      <StatusBadge status={ship.production_status} size="sm" />
                    )}
                  </div>
                  {ship.custom_name && (
                    <p className="text-sm text-sc-accent italic">"{ship.custom_name}"</p>
                  )}
                  <p className="text-xs font-mono text-gray-500">
                    {ship.manufacturer_name}
                    {ship.focus ? ` · ${ship.focus}` : ''}
                    {ship.size_label ? ` · ${ship.size_label}` : ''}
                  </p>
                  {ship.insurance_label && (
                    <div>
                      <InsuranceBadge
                        isLifetime={ship.is_lifetime === 1}
                        label={ship.insurance_label}
                      />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
