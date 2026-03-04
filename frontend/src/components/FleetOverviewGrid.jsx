import { DollarSign, Rocket, Package, Users, Activity } from 'lucide-react'

export default function FleetOverviewGrid({ overview, totalVehicles, ltiPercent, readyPercent }) {
  const ltiCount = overview.lti_count || 0

  return (
    <div className="bento-grid">
      {/* Hero: Fleet Value — spans 2 cols */}
      <div className="panel col-span-2 p-6 bg-grid animate-slide-up" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-sc-accent" />
          <span className="stat-label">Total Fleet Value</span>
        </div>
        <p className="text-5xl font-display font-bold text-sc-accent leading-tight">
          ${(overview.total_pledge_value || 0).toLocaleString()}
        </p>
        <p className="text-sm text-gray-500 mt-2 font-mono">{totalVehicles} ships pledged</p>
      </div>

      {/* Ship Count */}
      <div className="panel p-5 bg-grid animate-slide-up" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="w-4 h-4 text-sc-accent2" />
          <span className="stat-label">Ships</span>
        </div>
        <p className="text-4xl font-display font-bold text-white">{totalVehicles}</p>
      </div>

      {/* Cargo */}
      <div className="panel p-5 bg-grid animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-sc-accent2" />
          <span className="stat-label">Cargo (SCU)</span>
        </div>
        <p className="text-4xl font-display font-bold text-white">{Math.round(overview.total_cargo || 0).toLocaleString()}</p>
      </div>

      {/* Min Crew */}
      <div className="panel p-5 bg-grid animate-slide-up" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="stat-label">Min Crew</span>
        </div>
        <p className="text-3xl font-display font-bold text-white">{overview.min_crew || 0}</p>
      </div>

      {/* Max Crew */}
      <div className="panel p-5 bg-grid animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="stat-label">Max Crew</span>
        </div>
        <p className="text-3xl font-display font-bold text-white">{overview.max_crew || 0}</p>
      </div>

      {/* Fleet Health — spans 2 cols */}
      <div className="panel col-span-2 p-5 bg-grid animate-slide-up" style={{ animationDelay: '250ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-sc-success" />
          <span className="stat-label">Fleet Health</span>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-sc-lti">LTI Coverage</span>
              <span className="text-gray-400">{ltiCount}/{totalVehicles} ({ltiPercent}%)</span>
            </div>
            <div className="status-bar" role="progressbar" aria-valuenow={ltiPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`LTI coverage: ${ltiPercent}%`}>
              <div className="status-bar-fill bg-sc-lti" style={{ width: `${ltiPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-sc-success">Flight Ready</span>
              <span className="text-gray-400">{overview.flight_ready || 0}/{totalVehicles} ({readyPercent}%)</span>
            </div>
            <div className="status-bar" role="progressbar" aria-valuenow={readyPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`Flight ready: ${readyPercent}%`}>
              <div className="status-bar-fill bg-sc-success" style={{ width: `${readyPercent}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
