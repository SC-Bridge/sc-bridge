import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useAnalysis, useLLMConfig, generateAIAnalysis, useLatestAIAnalysis } from '../hooks/useAPI'
import useTimezone from '../hooks/useTimezone'
import { formatDateOnly } from '../lib/dates'
import { AlertCircle, AlertTriangle, Info, Copy, ChevronRight, Sparkles, Loader, Rocket, Crosshair, Shield } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../lib/theme'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import StatCard from '../components/StatCard'
import PanelSection from '../components/PanelSection'
import FleetOverviewGrid from '../components/FleetOverviewGrid'
import SectionBoundary from '../components/SectionBoundary'

const PRIORITY_CONFIG = {
  high: { icon: AlertCircle, color: 'text-sc-danger', bg: 'bg-sc-danger/10', border: 'border-sc-danger/20', label: 'HIGH' },
  medium: { icon: AlertTriangle, color: 'text-sc-warn', bg: 'bg-sc-warn/10', border: 'border-sc-warn/20', label: 'MEDIUM' },
  low: { icon: Info, color: 'text-sc-accent2', bg: 'bg-sc-accent2/10', border: 'border-sc-accent2/20', label: 'LOW' },
}

export default function Analysis() {
  const { timezone } = useTimezone()
  const { data: analysis, loading, error, refetch } = useAnalysis()
  const { data: llmConfig } = useLLMConfig()
  const { data: latestAnalysis } = useLatestAIAnalysis()
  const [aiInsights, setAIInsights] = useState(null)
  const [aiTimestamp, setAITimestamp] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAIError] = useState(null)

  useEffect(() => {
    if (latestAnalysis?.analysis) {
      setAIInsights(latestAnalysis.analysis)
      if (latestAnalysis.created_at) {
        setAITimestamp(latestAnalysis.created_at)
      }
    }
  }, [latestAnalysis])

  const handleGenerateAI = async () => {
    setGenerating(true)
    setAIError(null)
    try {
      const result = await generateAIAnalysis()
      setAIInsights(result.analysis)
      setAITimestamp(new Date().toISOString())
    } catch (err) {
      setAIError('Failed to generate AI analysis: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <LoadingState message="Analysing fleet..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const overview = analysis?.overview || {}
  const sizeDist = analysis?.size_distribution || {}
  const roles = analysis?.role_categories || {}
  const ins = analysis?.insurance_summary || {}
  const gaps = analysis?.gap_analysis || []
  const redundancies = analysis?.redundancies || []
  const totalVehicles = overview.total_vehicles || 0

  // Empty fleet guard
  if (totalVehicles === 0) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="FLEET ANALYSIS"
          subtitle="Fleet composition, coverage, and insurance"
        />
        <div className="panel p-12 text-center">
          <Rocket className="w-16 h-16 mx-auto mb-4 text-sc-accent/60" />
          <h2 className="font-display font-bold text-2xl text-white mb-2">No Ships Detected</h2>
          <p className="text-gray-400 text-base mb-6 max-w-md mx-auto">
            Import your hangar from HangarXplor to see fleet analysis, insurance coverage, and gap detection.
          </p>
          <Link to="/import" className="btn-primary inline-flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Import Your Fleet
          </Link>
        </div>
      </div>
    )
  }

  const sizeData = Object.entries(sizeDist).map(([name, value]) => ({ name, value }))
  const roleData = Object.entries(roles).map(([name, ships]) => {
    // Count occurrences then format as "Ship Name (x2)" for duplicates
    const counts = {}
    for (const s of ships) counts[s] = (counts[s] || 0) + 1
    const deduped = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([s, n]) => n > 1 ? `${s} (x${n})` : s)
    return { name, count: ships.length, ships: deduped }
  }).sort((a, b) => b.count - a.count)

  const ltiCount = overview.lti_count || 0
  const nonLtiCount = overview.non_lti_count || 0
  const unknownCount = totalVehicles - ltiCount - nonLtiCount
  const ltiPercent = totalVehicles > 0 ? Math.round((ltiCount / totalVehicles) * 100) : 0
  const readyPercent = totalVehicles > 0 ? Math.round(((overview.flight_ready || 0) / totalVehicles) * 100) : 0

  // Find high-value non-LTI ships
  const nonLtiShips = ins.non_lti_ships || []
  const highValueNonLti = nonLtiShips.filter(s => s.pledge_cost > 200)

  const aiButton = llmConfig?.api_key_set ? (
    <button
      onClick={handleGenerateAI}
      disabled={generating}
      className="btn-secondary flex items-center gap-2"
    >
      {generating ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          Generate AI Insights
        </>
      )}
    </button>
  ) : null

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="FLEET ANALYSIS"
        subtitle="Fleet composition, coverage, and insurance"
        actions={aiButton}
      />

      {/* Fleet Overview — Bento Grid */}
      <FleetOverviewGrid overview={overview} totalVehicles={totalVehicles} ltiPercent={ltiPercent} readyPercent={readyPercent} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionBoundary label="Size Distribution">
        <PanelSection title="Size Distribution" icon={Crosshair}>
          <div className="p-4 h-80 bg-grid" role="img" aria-label={`Size distribution: ${sizeData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
          <div className="p-4 bg-grid" style={{ height: Math.max(320, roleData.length * 40 + 40) }} role="img" aria-label={`Role categories: ${roleData.map(d => `${d.name}: ${d.count}`).join(', ')}`}>
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
                        {ships.map((s, i) => (
                          <p key={i} style={{ ...TOOLTIP_STYLE.itemStyle, margin: 0, lineHeight: 1.5 }}>{s}</p>
                        ))}
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

      {/* Insurance Summary */}
      <div>
        <h3 className="font-display font-semibold text-sm uppercase tracking-widest text-gray-400 mb-3">
          Insurance Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={Shield} label="LTI Ships" value={ltiCount} color="text-sc-lti" accentBorder="border-sc-lti" />
          <StatCard icon={Shield} label="Non-LTI Ships" value={nonLtiCount} color="text-sc-warn" accentBorder="border-sc-warn" />
          <StatCard icon={Shield} label="Unknown Insurance" value={unknownCount} color="text-gray-400" />
        </div>
        {highValueNonLti.length > 0 && (
          <div className="panel p-4 mt-3 border-l-2 border-sc-warn/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-sc-warn shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-sc-warn mb-1">High-Value Ships Without LTI</p>
                <p className="text-xs text-gray-400">
                  {highValueNonLti.length} ship{highValueNonLti.length !== 1 ? 's' : ''} worth over $200 {highValueNonLti.length !== 1 ? 'lack' : 'lacks'} lifetime insurance:{' '}
                  {highValueNonLti.map(s => s.name).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gap Analysis */}
      <div>
        <h3 className="font-display font-semibold text-sm uppercase tracking-widest text-gray-400 mb-3">
          Role Gaps
        </h3>
        {gaps.length === 0 ? (
          <EmptyState message="No significant gaps detected. Your fleet covers all major roles!" />
        ) : (
          <div className="space-y-3">
            {gaps.map((gap, i) => {
              const cfg = PRIORITY_CONFIG[gap.priority] || PRIORITY_CONFIG.low
              const Icon = cfg.icon
              return (
                <div key={i} className={`panel border-l-2 ${cfg.border} overflow-hidden`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 ${cfg.color} shrink-0 mt-0.5`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-display font-semibold text-white">{gap.role}</span>
                          <span className={`badge ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mb-3">{gap.description}</p>
                        {gap.suggestions && gap.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {gap.suggestions.map((s, j) => (
                              <span
                                key={j}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 text-xs font-mono text-gray-300 border border-sc-border"
                              >
                                <ChevronRight className="w-3 h-3 text-sc-accent" />
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Redundancies */}
      <div>
        <h3 className="font-display font-semibold text-sm uppercase tracking-widest text-gray-400 mb-3">
          Redundancies
        </h3>
        {redundancies.length === 0 ? (
          <EmptyState message="No excessive redundancies detected. Your fleet has good role diversity." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {redundancies.map((group, i) => (
              <div key={i} className="panel">
                <div className="px-4 py-3 border-b border-sc-border/50 flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-sc-melt" />
                  <span className="font-display text-sm font-semibold text-white">{group.role}</span>
                  <span className="ml-auto text-xs font-mono text-gray-500">{group.ships.length} ships</span>
                </div>
                <div className="p-4 space-y-1.5">
                  {group.ships.map((ship, j) => (
                    <div key={j} className="text-sm text-gray-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sc-border" />
                      {ship}
                    </div>
                  ))}
                  {group.notes && (
                    <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-sc-border/30">
                      {group.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Insights (supplementary, at bottom) */}
      {aiError && (
        <div className="panel p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-sc-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-sc-danger">{aiError}</p>
              <button onClick={() => setAIError(null)} className="btn-ghost text-xs mt-2">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {aiInsights && (
        <SectionBoundary label="AI Fleet Insights">
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="flex-1">AI Fleet Insights</span>
            {aiTimestamp && (
              <span className="text-[11px] font-mono text-gray-500 normal-case tracking-normal">
                Generated {formatDateOnly(aiTimestamp, timezone)}
              </span>
            )}
          </div>
          <div className="p-5">
            <div className="prose-fleet">
              <ReactMarkdown>{aiInsights}</ReactMarkdown>
            </div>
          </div>
        </div>
        </SectionBoundary>
      )}
    </div>
  )
}
