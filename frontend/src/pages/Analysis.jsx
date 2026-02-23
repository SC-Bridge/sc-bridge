import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAnalysis, useLLMConfig, generateAIAnalysis, useLatestAIAnalysis } from '../hooks/useAPI'
import useTimezone from '../hooks/useTimezone'
import { formatDateOnly } from '../lib/dates'
import { AlertCircle, AlertTriangle, Info, Copy, ChevronRight, Sparkles, Loader } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import EmptyState from '../components/EmptyState'

const PRIORITY_CONFIG = {
  high: { icon: AlertCircle, color: 'text-sc-danger', bg: 'bg-sc-danger/10', border: 'border-sc-danger/20', label: 'HIGH' },
  medium: { icon: AlertTriangle, color: 'text-sc-warn', bg: 'bg-sc-warn/10', border: 'border-sc-warn/20', label: 'MEDIUM' },
  low: { icon: Info, color: 'text-sc-accent2', bg: 'bg-sc-accent2/10', border: 'border-sc-accent2/20', label: 'LOW' },
}

export default function Analysis() {
  const { timezone } = useTimezone()
  const { data: analysis, loading, error } = useAnalysis()
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
  if (error) return <ErrorState message={error} />

  const gaps = analysis?.gap_analysis || []
  const redundancies = analysis?.redundancies || []

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="FLEET ANALYSIS"
        subtitle="Gap analysis and redundancy detection"
      />

      {/* AI Insights Button (only if LLM configured) */}
      {llmConfig?.api_key_set && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="btn-primary flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Generating AI Insights...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate AI Insights
              </>
            )}
          </button>
        </div>
      )}

      {/* AI Error */}
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

      {/* AI Insights Panel */}
      {aiInsights && (
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
      )}

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
          <EmptyState message="No role redundancies detected." />
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
    </div>
  )
}
