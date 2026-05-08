import { useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import PanelSection from '../../components/PanelSection'
import { setPreferences } from '../../hooks/useAPI'
import {
  ACCOUNTANT_TIERS,
  ACCOUNTANT_MODULES,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  isModuleAvailable,
} from './constants'

const PREF_ENDPOINT = '/api/settings/preferences'

async function fetchPreferences() {
  const res = await fetch(PREF_ENDPOINT, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`GET preferences failed: ${res.status}`)
  return res.json()
}

export default function AccountantSettings() {
  const [tier, setTier] = useState(null) // null while loading
  const [savingError, setSavingError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPreferences()
      .then((prefs) => {
        if (cancelled) return
        setTier(prefs.accountantTier ?? 'easy')
      })
      .catch(() => {
        if (cancelled) return
        setTier('easy') // graceful default on fetch failure
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleTierChange(nextTier) {
    const previous = tier
    setTier(nextTier) // optimistic
    setSavingError(null)
    try {
      await setPreferences({ accountantTier: nextTier })
    } catch (err) {
      setTier(previous)
      setSavingError(err.message ?? 'Failed to save tier')
    }
  }

  if (tier === null) {
    return (
      <div data-testid="accountant-settings-loading" className="p-6">
        <div className="h-8 w-48 bg-sc-darker rounded animate-pulse mb-6" />
        <div className="space-y-3">
          <div className="h-12 w-full bg-sc-darker rounded animate-pulse" />
          <div className="h-12 w-full bg-sc-darker rounded animate-pulse" />
          <div className="h-12 w-full bg-sc-darker rounded animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ACCOUNTANT"
        subtitle="Configure your accounting tier and module access"
      />

      {savingError && (
        <div
          role="alert"
          data-testid="accountant-settings-error"
          className="panel p-4 flex items-center gap-2 text-sm animate-fade-in border-sc-danger/30 text-sc-danger"
        >
          {savingError}
        </div>
      )}

      <PanelSection title="Accounting Tier">
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Pick the depth of accounting you want. You can change this any time.
          </p>

          <div className="space-y-2">
            {ACCOUNTANT_TIERS.map((t) => (
              <label
                key={t}
                className={`block p-4 rounded border-2 cursor-pointer transition-colors ${
                  tier === t
                    ? 'border-sc-accent bg-sc-accent/10'
                    : 'border-sc-border hover:border-sc-accent2/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="accountantTier"
                    value={t}
                    checked={tier === t}
                    onChange={() => handleTierChange(t)}
                    aria-label={TIER_LABELS[t]}
                    className="mr-1"
                  />
                  <div className="flex-1">
                    <span className="text-white font-medium">{TIER_LABELS[t]}</span>
                    <span className="block text-sm text-gray-400 mt-0.5">
                      {TIER_DESCRIPTIONS[t]}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Modules at Your Tier">
        <div className="p-5">
          <p className="text-sm text-gray-400 mb-4">
            Modules unlocked at the <span className="text-white font-medium">{TIER_LABELS[tier]}</span> tier and above.
          </p>
          <ul className="space-y-2">
            {ACCOUNTANT_MODULES.map((m) => {
              const available = isModuleAvailable(m.minTier, tier)
              const testId = `module-${m.id}-${available ? 'available' : 'locked'}`
              return (
                <li
                  key={m.id}
                  data-testid={testId}
                  className={`flex items-center gap-3 rounded border p-3 transition-colors ${
                    available
                      ? 'border-sc-border'
                      : 'border-sc-border/40 opacity-50'
                  }`}
                >
                  <span aria-hidden className={`text-sm font-mono ${available ? 'text-sc-success' : 'text-gray-600'}`}>
                    {available ? '✓' : '✗'}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium text-white">{m.name}</span>
                    <span className="block text-sm text-gray-400">{m.description}</span>
                  </span>
                  {!available && (
                    <span className="text-xs uppercase tracking-wider text-gray-500 shrink-0">
                      Upgrade to {TIER_LABELS[m.minTier]}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </PanelSection>
    </div>
  )
}
