import React from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/auth-client'
import { useStatus, useAnalysis } from '../hooks/useAPI'
import { Rocket, Shield, Crosshair, Database, LogIn } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../lib/theme'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import PanelSection from '../components/PanelSection'
import FleetOverviewGrid from '../components/FleetOverviewGrid'
import SectionBoundary from '../components/SectionBoundary'

export default function Dashboard() {
  const { data: session, isPending: sessionPending } = useSession()
  const isLoggedIn = !!session?.user
  const { data: status, loading: statusLoading } = useStatus()
  const { data: analysis, loading: analysisLoading } = useAnalysis({ skip: !isLoggedIn })

  if (sessionPending || statusLoading || (isLoggedIn && analysisLoading)) {
    return <LoadingState variant="skeleton" />
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
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5">
              <LogIn className="w-4 h-4" /> Sign In
            </Link>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-sc-accent/10 border border-sc-accent/30 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-sc-accent animate-pulse shrink-0" />
            <span className="text-xs font-mono text-sc-accent tracking-wider">Coming Soon — Registration opening shortly</span>
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
  const roleData = Object.entries(roles).map(([name, ships]) => ({ name, count: ships.length }))

  const ltiPercent = totalVehicles > 0 ? Math.round(((overview.lti_count || 0) / totalVehicles) * 100) : 0
  const readyPercent = totalVehicles > 0 ? Math.round(((overview.flight_ready || 0) / totalVehicles) * 100) : 0

  // Empty fleet — show onboarding
  if (totalVehicles === 0) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="FLEET OVERVIEW"
          subtitle={`${status?.ships || 0} ships in database`}
        />
        <div className="panel p-12 text-center">
          <Rocket className="w-16 h-16 mx-auto mb-4 text-sc-accent/60" />
          <h2 className="font-display font-bold text-2xl text-white mb-2">Welcome, Commander</h2>
          <p className="text-gray-400 text-base mb-6 max-w-md mx-auto">
            Your fleet is empty. Import your hangar from HangarXplor to get started with fleet tracking, insurance monitoring, and gap analysis.
          </p>
          <Link to="/import" className="btn-primary inline-flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Import Your Fleet
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="FLEET OVERVIEW"
        subtitle={`${status?.ships || 0} ships in database · ${status?.vehicles || 0} in fleet`}
      />

      <FleetOverviewGrid overview={overview} totalVehicles={totalVehicles} ltiPercent={ltiPercent} readyPercent={readyPercent} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionBoundary label="Size Distribution">
        <PanelSection title="Size Distribution" icon={Crosshair}>
          <div className="p-4 h-64 bg-grid" role="img" aria-label={`Size distribution: ${sizeData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sizeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
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
          <div className="p-4 h-64 bg-grid" role="img" aria-label={`Role categories: ${roleData.map(d => `${d.name}: ${d.count}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleData} layout="vertical" margin={{ left: 100, right: 30 }}>
                <XAxis type="number" allowDecimals={false} domain={[0, 'dataMax + 1']} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  width={95}
                />
                <Tooltip {...TOOLTIP_STYLE} />
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
