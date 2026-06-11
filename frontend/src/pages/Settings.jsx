import React, { useState, useEffect } from 'react'
import { useLLMConfig, setLLMConfig, testLLMConnection, usePreferences, setPreferences } from '../hooks/useAPI'
import { Key, CheckCircle, XCircle, Loader, Trash2, Eye, EyeOff, Type, Globe, Shield, FlaskConical, Wallet } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import PanelSection from '../components/PanelSection'
import ProviderLogo, { PROVIDER_INFO } from '../components/ProviderLogo'
import ConfirmDialog from '../components/ConfirmDialog'
import useFontPreference from '../hooks/useFontPreference'
import useTimezone from '../hooks/useTimezone'
import usePrivacyMode from '../hooks/usePrivacyMode'
import { formatDate } from '../lib/dates'
import { AccountantSettingsSection } from './Accountant'

const FONT_OPTIONS = [
  { key: 'default', label: 'Default', desc: 'Inter body + Electrolize headings', preview: '"Inter", "Segoe UI"' },
  { key: 'lexend', label: 'Lexend', desc: 'Designed for improved reading fluency', preview: '"Lexend"' },
  { key: 'atkinson', label: 'Atkinson Hyperlegible', desc: 'Maximum character distinction', preview: '"Atkinson Hyperlegible"' },
  { key: 'opendyslexic', label: 'OpenDyslexic', desc: 'Weighted bottoms to reduce letter swapping', preview: '"OpenDyslexic"' },
]

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone')

const PROVIDERS = [
  { value: 'anthropic', label: 'Claude', company: 'Anthropic', desc: 'Opus 4.7, Sonnet 4.6, Haiku 4.5' },
  { value: 'openai', label: 'ChatGPT', company: 'OpenAI', desc: 'GPT-5.2, GPT-5 Mini, GPT-4o' },
  { value: 'google', label: 'Gemini', company: 'Google', desc: '2.5 Pro, Flash, Flash-Lite' },
]

const PRIVACY_MODES = [
  { value: 'off', label: 'Off', desc: 'Show real values everywhere' },
  { value: 'hidden', label: 'Hidden', desc: 'Replace dollar amounts with •••' },
  { value: 'stealth', label: 'Stealth', desc: 'Show values reduced by a percentage' },
]

export default function Settings() {
  const { fontPreference, setFontPreference } = useFontPreference()
  const { timezone, setTimezone } = useTimezone()
  const { mode: privacyModeState, stealthPercent, setStealthPercent, setMode } = usePrivacyMode()
  const [tzSearch, setTzSearch] = useState('')
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false)
  const { data: config, refetch } = useLLMConfig()
  const { data: preferences, refetch: refetchPrefs } = usePreferences()
  const [activeProvider, setActiveProvider] = useState('anthropic')
  const [apiKey, setAPIKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [notification, setNotification] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false })

  const showNotification = (msg, variant = 'info') => {
    setNotification({ msg, variant })
    setTimeout(() => setNotification(null), 3000)
  }

  const providerConfig = config?.providers?.[activeProvider]

  const handleTestConnection = async () => {
    if (!activeProvider || !apiKey) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testLLMConnection(activeProvider, apiKey)
      setTestResult({ success: true, modelCount: result.models?.length || 0 })
    } catch (err) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setLLMConfig({ provider: activeProvider, api_key: apiKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      refetch()
      setAPIKey('')
      setTestResult(null)
    } catch (err) {
      showNotification('Failed to save: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setConfirmDialog({
      open: true,
      title: `Remove ${PROVIDERS.find(p => p.value === activeProvider)?.label || activeProvider} Key`,
      message: 'This will delete the encrypted API key for this provider.',
      variant: 'danger',
      confirmLabel: 'Remove Key',
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        try {
          await setLLMConfig({ provider: activeProvider, api_key: '' })
          setAPIKey('')
          setTestResult(null)
          await refetch()
          showNotification('API key removed', 'success')
        } catch (err) {
          showNotification('Failed: ' + err.message, 'error')
        }
      },
    })
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="SETTINGS"
        subtitle="Display, timezone, and AI provider settings"
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

      <PanelSection title="Preview Channel" icon={FlaskConical}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Switch which game-version data the site shows. <strong>LIVE</strong> is the
            currently-released patch. <strong>PTU</strong> previews unreleased data
            from CIG's Public Test Universe — handy for verifying upcoming ships,
            crafting recipes, and items before they go live.
          </p>
          <div className="space-y-2">
            {[
              { key: null, label: 'LIVE', desc: 'Current released patch (default)' },
              { key: '4.8.0-ptu', label: 'PTU 4.8.0', desc: 'Public Test Universe — preview data' },
            ].map((c) => {
              const checked = (preferences?.adminPreviewPatch || null) === c.key
              return (
                <label
                  key={c.key ?? 'live'}
                  className={`block p-4 rounded border-2 cursor-pointer transition-colors ${
                    checked
                      ? 'border-sc-accent bg-sc-accent/10'
                      : 'border-sc-border hover:border-sc-accent2/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="preview-channel"
                      value={c.key ?? ''}
                      checked={checked}
                      onChange={async () => {
                        try {
                          await setPreferences({ adminPreviewPatch: c.key })
                          await refetchPrefs()
                          showNotification(`Preview channel: ${c.label}`, 'success')
                          // Reload so cached page data switches channel
                          setTimeout(() => window.location.reload(), 300)
                        } catch (err) {
                          showNotification('Failed to switch channel: ' + err.message, 'error')
                        }
                      }}
                      className="mr-1"
                    />
                    <div className="flex-1">
                      <span className="text-white font-medium">{c.label}</span>
                      <span className="text-xs text-gray-500 ml-2">{c.desc}</span>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
          {preferences?.adminPreviewPatch && (
            <p className="text-xs text-amber-400">
              ⚠ You're previewing PTU data. Some entries may be incomplete or
              change before going live. Switch back to LIVE for the released
              patch.
            </p>
          )}
        </div>
      </PanelSection>

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

      <PanelSection title="Privacy" icon={Shield}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Control how dollar values are displayed. Useful when streaming or screen sharing.
          </p>

          <div className="space-y-2">
            {PRIVACY_MODES.map((m) => (
              <label
                key={m.value}
                className={`block p-4 rounded border-2 cursor-pointer transition-colors ${
                  privacyModeState === m.value
                    ? 'border-sc-accent bg-sc-accent/10'
                    : 'border-sc-border hover:border-sc-accent2/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="privacy-mode"
                    value={m.value}
                    checked={privacyModeState === m.value}
                    onChange={() => setMode(m.value)}
                    className="mr-1"
                  />
                  <div className="flex-1">
                    <span className="text-white font-medium">{m.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{m.desc}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {privacyModeState === 'stealth' && (
            <div className="p-4 rounded bg-white/[0.02] border border-sc-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Display percentage</span>
                <span className="text-sm font-mono text-sc-accent">{stealthPercent}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={90}
                value={stealthPercent}
                onChange={(e) => setStealthPercent(parseInt(e.target.value, 10))}
                className="w-full h-1.5 accent-sc-accent cursor-pointer"
              />
              <p className="text-xs text-gray-500">
                A $1,000 ship will display as ${Math.round(1000 * stealthPercent / 100).toLocaleString()}
              </p>
            </div>
          )}
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

      <PanelSection title="AI Providers" icon={Key}>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Add API keys for one or more providers. You can switch between them when generating AI analysis.
          </p>

          {/* Provider tabs */}
          <div className="flex gap-2">
            {PROVIDERS.map((p) => {
              const isConfigured = config?.providers?.[p.value]?.api_key_set
              return (
                <button
                  key={p.value}
                  onClick={() => { setActiveProvider(p.value); setAPIKey(''); setTestResult(null); setShowApiKey(false) }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all border flex items-center gap-2 ${
                    activeProvider === p.value
                      ? 'bg-sc-accent/10 text-sc-accent border-sc-accent/30'
                      : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
                  }`}
                >
                  <ProviderLogo provider={p.value} className={`w-4 h-4 ${activeProvider === p.value ? 'text-sc-accent' : PROVIDER_INFO[p.value]?.color || ''}`} />
                  {p.label}
                  {isConfigured && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              )
            })}
          </div>

          {/* Active provider config */}
          <div className="p-4 rounded-lg bg-white/[0.02] border border-sc-border/40 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-white font-medium">
                  {PROVIDERS.find(p => p.value === activeProvider)?.company}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {PROVIDERS.find(p => p.value === activeProvider)?.desc}
                </span>
              </div>
              {providerConfig?.api_key_set && (
                <span className="text-xs font-mono text-sc-accent bg-sc-accent/10 px-2 py-1 rounded">
                  {providerConfig.api_key_mask}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setAPIKey(e.target.value)}
                placeholder={providerConfig?.api_key_set ? 'Enter new key to replace' : 'Enter your API key'}
                className="w-full bg-sc-darker border border-sc-border rounded px-3 py-2 pr-10 text-sm font-mono text-gray-300 placeholder:text-gray-500 focus:outline-none focus:border-sc-accent/50 focus:ring-1 focus:ring-sc-accent/20 transition-colors"
              />
              {apiKey && (
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleTestConnection} disabled={!apiKey || testing} className="btn-secondary flex items-center gap-2 text-sm">
                {testing ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Testing...</> : 'Test Connection'}
              </button>
              <button onClick={handleSave} disabled={!apiKey || saving} className="btn-primary flex items-center gap-2 text-sm">
                {saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : saving ? <><Loader className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Key'}
              </button>
              {providerConfig?.api_key_set && (
                <button onClick={handleClear} className="btn-ghost text-sc-danger flex items-center gap-1.5 text-sm ml-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            {testResult && (
              <div className={`p-3 rounded flex items-center gap-2 text-sm ${
                testResult.success
                  ? 'bg-sc-success/10 border border-sc-success/20 text-sc-success'
                  : 'bg-sc-danger/10 border border-sc-danger/20 text-sc-danger'
              }`}>
                {testResult.success ? <><CheckCircle className="w-4 h-4" /> Connection successful!</> : <><XCircle className="w-4 h-4" /> {testResult.error}</>}
              </div>
            )}
          </div>
        </div>
      </PanelSection>

      <ConfirmDialog
        open={confirmDialog.open}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog({ open: false })}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
      />

      <PanelSection title="Accountant" icon={Wallet}>
        <div className="p-5">
          <AccountantSettingsSection />
        </div>
      </PanelSection>
    </div>
  )
}
