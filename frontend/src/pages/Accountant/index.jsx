import { useEffect, useState } from 'react'
import PanelSection from '../../components/PanelSection'
import { setPreferences, usePreferences } from '../../hooks/useAPI'
import {
  ACCOUNTANT_TIERS,
  ACCOUNTANT_MODULES,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  isModuleAvailable,
} from './constants'

/**
 * AccountantSettingsSection — standalone content block (no PageHeader).
 * Consumed by the site Settings page at the bottom of the page.
 * Reads preferences through the shared usePreferences hook so writes elsewhere
 * (the preferences:changed event) live-refresh this section too.
 */
export function AccountantSettingsSection() {
  const { data: prefs, loading } = usePreferences()
  const [tier, setTier] = useState(null) // null while loading
  const [verifyThreshold, setVerifyThreshold] = useState(10)
  const [savingError, setSavingError] = useState(null)

  // Hydrate the editable state from the fetched preferences (or on live
  // refresh). When the fetch settles without data (error/401) fall back to the
  // 'easy' default so the section renders rather than hanging on the skeleton —
  // matching the old raw-fetch catch.
  useEffect(() => {
    if (prefs) {
      setTier(prefs.accountantTier ?? 'easy')
      setVerifyThreshold(parseInt(prefs.accountantVerifyThreshold ?? '10', 10))
    } else if (!loading) {
      setTier((t) => t ?? 'easy')
    }
  }, [prefs, loading])

  async function handleThresholdChange(raw) {
    const value = Math.max(10, parseInt(raw, 10) || 10)
    setVerifyThreshold(value)
    setSavingError(null)
    try {
      await setPreferences({ accountantVerifyThreshold: String(value) })
    } catch (err) {
      setSavingError(err.message ?? 'Failed to save threshold')
    }
  }

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
    <div className="space-y-6">
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

      <PanelSection title="Notifications">
        <div className="p-5 space-y-2">
          <label htmlFor="verifyThreshold" className="block text-sm text-gray-400">
            Verification threshold
          </label>
          <input
            id="verifyThreshold"
            aria-label="Verification threshold"
            type="number"
            min="10"
            key={verifyThreshold}
            defaultValue={verifyThreshold}
            onBlur={(e) => handleThresholdChange(e.target.value)}
            className="w-32 bg-sc-darker border border-sc-border rounded px-2 py-1.5 text-sm"
          />
          <p className="text-xs text-gray-600">
            Remind me when the Sorting List reaches this many unsorted entries (minimum 10).
          </p>
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

