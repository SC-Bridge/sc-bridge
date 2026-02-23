import React, { useState, useEffect } from 'react'
import { useLLMConfig, setLLMConfig, testLLMConnection } from '../hooks/useAPI'
import { Settings as SettingsIcon, Key, CheckCircle, XCircle, Loader, Trash2, Eye, EyeOff, Type, Globe } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import PanelSection from '../components/PanelSection'
import FilterSelect from '../components/FilterSelect'
import ConfirmDialog from '../components/ConfirmDialog'
import useFontPreference from '../hooks/useFontPreference'
import useTimezone from '../hooks/useTimezone'
import { formatDate } from '../lib/dates'

const FONT_OPTIONS = [
  { key: 'default', label: 'Default', desc: 'Inter body + Electrolize headings', preview: '"Inter", "Segoe UI"' },
  { key: 'lexend', label: 'Lexend', desc: 'Designed for improved reading fluency', preview: '"Lexend"' },
  { key: 'atkinson', label: 'Atkinson Hyperlegible', desc: 'Maximum character distinction', preview: '"Atkinson Hyperlegible"' },
  { key: 'opendyslexic', label: 'OpenDyslexic', desc: 'Weighted bottoms to reduce letter swapping', preview: '"OpenDyslexic"' },
]

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone')

export default function Settings() {
  const { fontPreference, setFontPreference } = useFontPreference()
  const { timezone, setTimezone } = useTimezone()
  const [tzSearch, setTzSearch] = useState('')
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false)
  const { data: config, refetch } = useLLMConfig()
  const [provider, setProvider] = useState('')
  const [apiKey, setAPIKey] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [notification, setNotification] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false })

  useEffect(() => {
    if (config) {
      setProvider(config.provider || '')
      setModel(config.model || '')
    }
  }, [config])

  const showNotification = (msg, variant = 'info') => {
    setNotification({ msg, variant })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleTestConnection = async () => {
    if (!provider || !apiKey) return

    setTesting(true)
    setTestResult(null)
    setModels([])

    try {
      const result = await testLLMConnection(provider, apiKey)
      const modelsList = result.models || []
      setModels(modelsList)
      setTestResult({ success: true, modelCount: modelsList.length })

      if (modelsList.length > 0 && !model) {
        setModel(modelsList[0].id)
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setLLMConfig({ provider, api_key: apiKey, model })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refetch()
      setAPIKey('')
    } catch (err) {
      showNotification('Failed to save: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setConfirmDialog({
      open: true,
      title: 'Remove LLM Configuration',
      message: 'This will delete your encrypted API key and model settings. You will need to re-configure to use AI fleet analysis.',
      variant: 'danger',
      confirmLabel: 'Remove Configuration',
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        try {
          await setLLMConfig({ provider: '', api_key: '', model: '' })
          setProvider('')
          setAPIKey('')
          setModel('')
          setModels([])
          setTestResult(null)
          await refetch()
          showNotification('LLM configuration cleared successfully', 'success')
        } catch (err) {
          showNotification('Failed to clear configuration: ' + err.message, 'error')
        }
      },
    })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="SETTINGS"
        subtitle="Configure LLM provider for AI fleet analysis"
      />

      {/* Inline notification */}
      {notification && (
        <div className={`panel p-4 flex items-center gap-2 text-sm animate-fade-in ${
          notification.variant === 'error' ? 'border-sc-danger/30 text-sc-danger' :
          notification.variant === 'success' ? 'border-sc-success/30 text-sc-success' :
          'text-gray-300'
        }`}>
          {notification.variant === 'success' && <CheckCircle className="w-4 h-4" />}
          {notification.variant === 'error' && <XCircle className="w-4 h-4" />}
          {notification.msg}
        </div>
      )}

      <PanelSection title="Display" icon={Type}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Choose a font for readability. Dyslexia-friendly options available.
          </p>

          <div className="space-y-2">
            {FONT_OPTIONS.map((f) => (
              <label
                key={f.key}
                className={`block p-4 rounded border-2 cursor-pointer transition-colors ${
                  fontPreference === f.key
                    ? 'border-sc-accent bg-sc-accent/10'
                    : 'border-sc-border hover:border-sc-accent2/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="font-preference"
                    value={f.key}
                    checked={fontPreference === f.key}
                    onChange={() => setFontPreference(f.key)}
                    className="mr-1"
                  />
                  <div className="flex-1">
                    <span className="text-white font-medium">{f.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{f.desc}</span>
                    <p
                      className="text-sm text-gray-400 mt-1"
                      style={{ fontFamily: f.preview }}
                    >
                      The quick brown fox jumps over the lazy dog.
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Regional" icon={Globe}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Choose your timezone for date and time display across the app.
          </p>

          <div className="relative max-w-md">
            <input
              type="text"
              value={tzDropdownOpen ? tzSearch : timezone}
              onChange={(e) => { setTzSearch(e.target.value); setTzDropdownOpen(true) }}
              onFocus={() => { setTzSearch(''); setTzDropdownOpen(true) }}
              onBlur={() => setTimeout(() => setTzDropdownOpen(false), 200)}
              placeholder="Search timezones..."
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            />
            {tzDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-sc-darker border border-sc-border rounded shadow-lg">
                {ALL_TIMEZONES
                  .filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
                  .slice(0, 50)
                  .map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setTimezone(tz)
                        setTzDropdownOpen(false)
                        setTzSearch('')
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors ${
                        tz === timezone ? 'text-sc-accent bg-sc-accent/10' : 'text-gray-300'
                      }`}
                    >
                      {tz}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded bg-sc-accent/10 border border-sc-accent/20 text-xs text-sc-accent font-mono">
            Preview: {formatDate(new Date().toISOString(), timezone)}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="LLM Provider" icon={SettingsIcon}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Choose your AI provider. You'll need to provide your own API key.
          </p>

          <div className="space-y-2">
            {[
              { value: 'openai', label: 'OpenAI (ChatGPT)', desc: 'GPT-4, GPT-3.5-turbo models' },
              { value: 'anthropic', label: 'Anthropic (Claude)', desc: 'Claude Opus, Sonnet, Haiku' },
              { value: 'google', label: 'Google (Gemini)', desc: 'Gemini Pro, Gemini Flash' },
            ].map((p) => (
              <label
                key={p.value}
                className={`block p-4 rounded border-2 cursor-pointer transition-colors ${
                  provider === p.value
                    ? 'border-sc-accent bg-sc-accent/10'
                    : 'border-sc-border hover:border-sc-accent2/40'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.value}
                  checked={provider === p.value}
                  onChange={(e) => setProvider(e.target.value)}
                  className="mr-3"
                />
                <span className="text-white font-medium">{p.label}</span>
                <span className="text-xs text-gray-500 ml-2">{p.desc}</span>
              </label>
            ))}
          </div>
        </div>
      </PanelSection>

      {provider && (
        <PanelSection title="API Key" icon={Key}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-400">
              Your API key is encrypted and stored securely. It never leaves your server.
            </p>

            {config?.api_key_set && (
              <div className="p-3 rounded bg-sc-accent/10 border border-sc-accent/20 text-xs text-sc-accent">
                Current key: <span className="font-mono">{config.api_key_mask}</span>
              </div>
            )}

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setAPIKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full bg-sc-darker border border-sc-border rounded px-3 py-2 pr-10 text-sm font-mono text-gray-300 placeholder:text-gray-500 focus:outline-none focus:border-sc-accent/50 focus:ring-1 focus:ring-sc-accent/20 transition-colors"
              />
              {apiKey && (
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>

            <button
              onClick={handleTestConnection}
              disabled={!apiKey || testing}
              className="btn-primary flex items-center gap-2"
            >
              {testing ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Test Connection'
              )}
            </button>

            {testResult && (
              <div
                className={`p-3 rounded flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-sc-success/10 border border-sc-success/20 text-sc-success'
                    : 'bg-sc-danger/10 border border-sc-danger/20 text-sc-danger'
                }`}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Connection successful! Found {testResult.modelCount} model{testResult.modelCount !== 1 ? 's' : ''}.
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    {testResult.error}
                  </>
                )}
              </div>
            )}
          </div>
        </PanelSection>
      )}

      {models.length > 0 && (
        <PanelSection title="Select Model">
          <div className="p-5">
            <FilterSelect
              value={model}
              onChange={(e) => setModel(e.target.value)}
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              className="w-full"
            />
          </div>
        </PanelSection>
      )}

      {provider && apiKey && model && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {saved ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved!
            </>
          ) : saving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Configuration'
          )}
        </button>
      )}

      {config?.api_key_set && (
        <button
          onClick={handleClear}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded border-2 border-sc-danger/30 text-sc-danger hover:bg-sc-danger/10 transition-colors text-sm font-medium"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Configuration
        </button>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog({ open: false })}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
      />
    </div>
  )
}
