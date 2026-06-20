import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useLLMConfig, generateAIAnalysis, useLatestAIAnalysis, setLLMConfig, useLLMModels } from '../hooks/useAPI'
import usePrivacyMode from '../hooks/usePrivacyMode'
import useTimezone from '../hooks/useTimezone'
import { formatDateOnly } from '../lib/dates'
import { resolveActiveModel } from '../lib/llmModels'
import { AlertCircle, Sparkles, Loader, ChevronRight, Settings, EyeOff, RefreshCw, MessageSquare } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import SectionBoundary from '../components/SectionBoundary'
import ProviderLogo, { PROVIDER_INFO } from '../components/ProviderLogo'
import FleetChat from './FleetChat'

export default function Analysis() {
  const { timezone } = useTimezone()
  const { data: llmConfig, loading: configLoading, refetch: refetchConfig } = useLLMConfig()
  const { data: latestAnalysis, loading: analysisLoading } = useLatestAIAnalysis()
  const [aiInsights, setAIInsights] = useState(null)
  const [aiMeta, setAIMeta] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAIError] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [selectedModel, setSelectedModel] = useState(null)
  const [mode, setMode] = useState('analysis') // 'analysis' | 'chat'
  const [context, setContext] = useState('')
  const { models: liveModels, loading: modelsLoading, refresh: refreshModels } = useLLMModels(selectedProvider)
  const { privacyMode } = usePrivacyMode()
  const resultsRef = useRef(null)
  const generatingRef = useRef(false)

  // Load latest analysis on mount
  useEffect(() => {
    if (latestAnalysis?.analysis) {
      setAIInsights(latestAnalysis.analysis)
      setAIMeta({
        created_at: latestAnalysis.created_at,
        provider: latestAnalysis.provider,
        model: latestAnalysis.model,
        vehicle_count: latestAnalysis.vehicle_count,
      })
    }
  }, [latestAnalysis])

  // Set initial provider/model from config
  useEffect(() => {
    if (llmConfig && !selectedProvider) {
      const providers = llmConfig.providers || {}
      const configured = Object.entries(providers).filter(([, v]) => v.api_key_set)
      if (configured.length > 0) {
        const [prov, conf] = configured[0]
        setSelectedProvider(prov)
        setSelectedModel(conf.model || null)
      }
    }
  }, [llmConfig, selectedProvider])

  const configuredProviders = llmConfig?.providers
    ? Object.entries(llmConfig.providers).filter(([, v]) => v.api_key_set)
    : []

  const hasAnyKey = configuredProviders.length > 0

  const handleProviderChange = async (provider) => {
    setSelectedProvider(provider)
    const conf = llmConfig?.providers?.[provider]
    setSelectedModel(conf?.model || null)
  }

  const handleModelChange = async (model) => {
    setSelectedModel(model)
    // Persist model choice to settings
    if (selectedProvider) {
      try {
        await setLLMConfig({ provider: selectedProvider, model })
        refetchConfig()
      } catch { /* silent */ }
    }
  }

  const handleGenerate = async () => {
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setAIError(null)
    try {
      const result = await generateAIAnalysis({
        provider: selectedProvider,
        model: selectedModel,
        context: context.trim() || undefined,
      })
      setAIInsights(result.analysis)
      setAIMeta({
        created_at: new Date().toISOString(),
        provider: selectedProvider,
        model: result.model || selectedModel,
        vehicle_count: result.vehicle_count,
      })
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err) {
      setAIError('Failed to generate analysis: ' + err.message)
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  if (configLoading || analysisLoading) return <LoadingState message="Loading..." />

  const models = liveModels || []
  const activeModel = resolveActiveModel(models, selectedModel)

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="AI ANALYSIS"
        subtitle="Deep fleet analysis powered by AI"
      />

      {/* Provider / Model Selection */}
      {hasAnyKey ? (
        <div className="panel p-5 space-y-4">
          {/* Mode toggle: one-shot Analysis vs conversational Chat */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('analysis')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2 ${
                mode === 'analysis'
                  ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                  : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Analysis
            </button>
            <button
              onClick={() => setMode('chat')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2 ${
                mode === 'chat'
                  ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                  : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-4 h-4" /> Chat about my fleet
            </button>
          </div>

          {/* Provider tabs */}
          {configuredProviders.length > 1 && (
            <div className="flex gap-2">
              {configuredProviders.map(([prov]) => {
                const info = PROVIDER_INFO[prov] || { name: prov, color: 'text-gray-400' }
                const isActive = selectedProvider === prov
                return (
                  <button
                    key={prov}
                    onClick={() => handleProviderChange(prov)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2 ${
                      isActive
                        ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                        : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
                    }`}
                  >
                    <ProviderLogo provider={prov} className={`w-4 h-4 ${isActive ? 'text-sc-accent' : info.color}`} />
                    {info.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Model selector */}
          <div className="flex flex-wrap items-center gap-3">
            {selectedProvider && (
              <span className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
                {configuredProviders.length === 1 && (
                  <>
                    <ProviderLogo provider={selectedProvider} className={`w-3.5 h-3.5 ${PROVIDER_INFO[selectedProvider]?.color || ''}`} />
                    {PROVIDER_INFO[selectedProvider]?.name} &middot;{' '}
                  </>
                )}
                Model:
              </span>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {modelsLoading && models.length === 0 ? (
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader className="w-3 h-3 animate-spin" /> Loading models…
                </span>
              ) : (
                models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleModelChange(m.id)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${
                      activeModel === m.id
                        ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                        : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
                    }`}
                    title={m.description || m.id}
                  >
                    {m.name}
                  </button>
                ))
              )}
              {selectedProvider && (
                <button
                  onClick={refreshModels}
                  disabled={modelsLoading}
                  className="px-2 py-1.5 rounded text-xs text-gray-500 border border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300 transition-all disabled:opacity-50"
                  title="Refresh model list from the provider"
                >
                  <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Analysis-only: context + generate */}
          {mode === 'analysis' && (
            <>
              <div>
                <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1.5">Additional context <span className="normal-case tracking-normal text-gray-600">(optional)</span></label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="E.g. I mainly play solo, I'm interested in cargo hauling and mining, my budget is around $300..."
                  rows={3}
                  maxLength={1000}
                  className="w-full bg-sc-darker border border-sc-border rounded-lg px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-sc-accent/40 focus:ring-1 focus:ring-sc-accent/20 transition-colors resize-none"
                />
                <div className="text-[10px] text-gray-600 text-right mt-1 font-mono">{context.length}/1000</div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary flex items-center gap-2"
              >
                {generating ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate Analysis</>
                )}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="panel p-8 text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <h2 className="font-display font-bold text-xl text-white mb-2">Unlock AI Fleet Analysis</h2>
          <p className="text-sm text-gray-400 mb-1">
            Get personalised fleet insights, strategic recommendations, and optimisation suggestions powered by AI.
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Add an API key for Claude, ChatGPT, or Gemini in your settings to get started.
          </p>
          <Link to="/settings" className="btn-primary inline-flex items-center gap-2">
            <Settings className="w-4 h-4" /> Go to Settings
          </Link>
        </div>
      )}

      {/* Chat mode */}
      {mode === 'chat' && hasAnyKey && (
        <FleetChat provider={selectedProvider} model={activeModel} />
      )}

      {/* Analysis output — analysis mode only */}
      {mode === 'analysis' && (
      <>
      {aiError && (
        <div className="panel p-4 border-l-2 border-sc-danger/40">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-sc-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-sc-danger">{aiError}</p>
              <button onClick={() => setAIError(null)} className="btn-ghost text-xs mt-2">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {aiInsights && (
        <div ref={resultsRef}>
          <SectionBoundary label="AI Fleet Analysis">
          <div className="panel">
            <div className="panel-header flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="flex-1">Analysis Results</span>
              {aiMeta && (
                <span className="text-[11px] font-mono text-gray-500 normal-case tracking-normal flex items-center gap-1.5">
                  <ProviderLogo provider={aiMeta.provider} className={`w-3 h-3 ${PROVIDER_INFO[aiMeta.provider]?.color || ''}`} />
                  {PROVIDER_INFO[aiMeta.provider]?.name || aiMeta.provider} &middot; {aiMeta.model} &middot; {formatDateOnly(aiMeta.created_at, timezone)}
                </span>
              )}
            </div>
            <div className="p-5">
              {privacyMode ? (
                <div className="text-center py-8 text-gray-500">
                  <EyeOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">AI analysis hidden in privacy mode</p>
                </div>
              ) : (
                <div className="prose-fleet">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{aiInsights}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
          </SectionBoundary>
        </div>
      )}
      </>
      )}
    </div>
  )
}
