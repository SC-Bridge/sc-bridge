import React from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/auth-client'
import { useStatus, useAnalysis } from '../hooks/useAPI'
import { Rocket, Shield, Crosshair, Database, LogIn } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../lib/theme'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import PanelSection from '../components/PanelSection'
import FleetOverviewGrid from '../components/FleetOverviewGrid'
import SectionBoundary from '../components/SectionBoundary'

export default function Dashboard() {
  const { data: session, isPending: sessionPending } = useSession()
  const isLoggedIn = !!session?.user
  const { data: status, loading: statusLoading, error: statusError } = useStatus()
  const { data: analysis, loading: analysisLoading, error: analysisError } = useAnalysis({ skip: !isLoggedIn })

  if (sessionPending || statusLoading || (isLoggedIn && analysisLoading)) {
    return <LoadingState variant="skeleton" />
  }

  // Only surface analysisError when the user is still logged in — a 401 from
  // analysis during logout (stale isLoggedIn before the session atom updates)
  // is expected and should not flash an error on the way out.
  if (statusError || (isLoggedIn && analysisError)) {
    return <ErrorState message={statusError || analysisError} />
  }

  // Public landing — show when not logged in
  if (!isLoggedIn) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="SC BRIDGE"
          subtitle="Star Citizen Fleet Management"
        />

        <div className="panel p-12 text-center bg-grid">
          <Rocket className="w-20 h-20 mx-auto mb-6 text-sc-accent/60" />
          <h2 className="font-display font-bold text-3xl text-white mb-3">Track Your Fleet</h2>
          <p className="text-gray-400 text-base mb-8 max-w-lg mx-auto">
            Import your Star Citizen hangar, track insurance and pledges, analyze fleet composition, and get AI-powered fleet recommendations.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5">
              <LogIn className="w-4 h-4" /> Sign In
            </Link>
            <Link to="/register" className="btn-secondary inline-flex items-center gap-2 px-6 py-2.5">
              Create Account
            </Link>
          </div>
        </div>

      </div>
    )
  }

  const overview = analysis?.overview || {}
  const sizeDist = analysis?.size_distribution || {}
  const roles = analysis?.role_categories || {}
  const totalVehicles = overview.total_vehicles || 0

  const sizeData = Object.entries(sizeDist).map(([name, value]) => ({ name, value }))
  const roleData = Object.entries(roles).map(([name, ships]) => {
    const counts = {}
    for (const s of ships) counts[s] = (counts[s] || 0) + 1
    const deduped = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([s, n]) => n > 1 ? `${s} (x${n})` : s)
    return { name, count: ships.length, ships: deduped }
  })

  const ltiPercent = totalVehicles > 0 ? Math.round(((overview.lti_count || 0) / totalVehicles) * 100) : 0
  const readyPercent = totalVehicles > 0 ? Math.round(((overview.flight_ready || 0) / totalVehicles) * 100) : 0

  // Empty fleet — show onboarding + useful reference info
  if (totalVehicles === 0) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="FLEET OVERVIEW"
          subtitle={`${status?.ships || 0} ships in reference database`}
        />
        <div className="panel p-12 text-center">
          <Rocket className="w-16 h-16 mx-auto mb-4 text-sc-accent/60" />
          <h2 className="font-display font-bold text-2xl text-white mb-2">Welcome, Commander</h2>
          <p className="text-gray-400 text-base mb-6 max-w-md mx-auto">
            Sync your RSI hangar to unlock fleet tracking, insurance monitoring, and AI-powered gap analysis.
          </p>
          <Link to="/sync-import" className="btn-primary inline-flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Sync Your Fleet
          </Link>
        </div>

        {/* Getting started checklist */}
        <div className="panel p-6">
          <h3 className="font-display text-sm font-semibold text-white mb-4 uppercase tracking-wider">Getting Started</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/sync-import" className="flex items-start gap-3 p-4 rounded bg-sc-darker/50 border border-sc-border hover:border-sc-accent/30 transition-colors group">
              <span className="w-7 h-7 rounded-full bg-sc-accent/10 text-sc-accent flex items-center justify-center shrink-0 text-xs font-bold group-hover:bg-sc-accent/20 transition-colors">1</span>
              <div>
                <p className="text-sm font-medium text-gray-200">Sync Your Hangar</p>
                <p className="text-xs text-gray-500 mt-0.5">Install the SC Bridge Sync extension and sync your RSI hangar from Settings.</p>
              </div>
            </Link>
            <Link to="/ships" className="flex items-start gap-3 p-4 rounded bg-sc-darker/50 border border-sc-border hover:border-sc-accent/30 transition-colors group">
              <span className="w-7 h-7 rounded-full bg-sc-accent/10 text-sc-accent flex items-center justify-center shrink-0 text-xs font-bold group-hover:bg-sc-accent/20 transition-colors">2</span>
              <div>
                <p className="text-sm font-medium text-gray-200">Browse Ship Database</p>
                <p className="text-xs text-gray-500 mt-0.5">{status?.ships || 0} ships with specs, components, loadouts, and paint variants.</p>
              </div>
            </Link>
            <Link to="/loot" className="flex items-start gap-3 p-4 rounded bg-sc-darker/50 border border-sc-border hover:border-sc-accent/30 transition-colors group">
              <span className="w-7 h-7 rounded-full bg-sc-accent/10 text-sc-accent flex items-center justify-center shrink-0 text-xs font-bold group-hover:bg-sc-accent/20 transition-colors">3</span>
              <div>
                <p className="text-sm font-medium text-gray-200">Find Loot & Gear</p>
                <p className="text-xs text-gray-500 mt-0.5">Search FPS weapons, armor, and gear with loot locations and shop availability.</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="FLEET OVERVIEW"
        subtitle={`${status?.vehicles || 0} ships in fleet · ${status?.ships || 0} in reference database`}
      />

      <FleetOverviewGrid overview={overview} totalVehicles={totalVehicles} ltiPercent={ltiPercent} readyPercent={readyPercent} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionBoundary label="Size Distribution">
        <PanelSection title="Size Distribution" icon={Crosshair}>
          <div className="p-4 h-80 bg-grid" role="img" aria-label={`Size distribution: ${sizeData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={sizeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={true}
                >
                  {sizeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </PanelSection>
        </SectionBoundary>

        <SectionBoundary label="Role Categories">
        <PanelSection title="Role Categories" icon={Shield}>
          <div className="p-4 bg-grid" style={{ height: Math.max(280, roleData.length * 36 + 40) }} role="img" aria-label={`Role categories: ${roleData.map(d => `${d.name}: ${d.count}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleData} layout="vertical" margin={{ left: 100, right: 30 }} barSize={20}>
                <XAxis type="number" allowDecimals={false} domain={[0, 'dataMax + 1']} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  width={95}
                  interval={0}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null
                    const { name, count, ships } = payload[0].payload
                    return (
                      <div style={{ ...TOOLTIP_STYLE.contentStyle, padding: '8px 12px', maxWidth: 280 }}>
                        <p style={{ ...TOOLTIP_STYLE.labelStyle, marginBottom: 4 }}>{name} ({count})</p>
                        {ships.map((s, i) => <p key={i} style={{ ...TOOLTIP_STYLE.itemStyle, margin: 0, lineHeight: 1.5 }}>{s}</p>)}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS[0]} fillOpacity={0.7} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="count" position="right" fill="#9ca3af" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelSection>
        </SectionBoundary>
      </div>

    </div>
  )
}
