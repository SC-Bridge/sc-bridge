import React, { useState } from 'react'
import { Trash2 } from 'lucide-react'
import PanelSection from '../../components/PanelSection'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useSession } from '../../lib/auth-client'

// Aligned with the real `cachedJson()` call sites in src/routes/* (verified
// 2026-05-18 — prior labels like `gd:vehicles`, `gd:loot`, `gd:factions`,
// `gd:contracts` matched ZERO actual keys, silently no-op'd on purge).
//
// "All Cache" lives at the BOTTOM so the default (first) selection is the
// safer "All Game Data" prefix — the default previously was "All Cache" which
// made a single mis-click nuke the entire KV namespace (F274).
const CACHE_PREFIXES = [
  { value: 'gd:',            label: 'All Game Data' },
  // Game Data sub-prefixes (gd:* keys live under here)
  { value: 'gd:npc-loadout', label: 'NPC Loadouts' },
  { value: 'gd:shops',       label: 'Shops + inventory' },
  { value: 'gd:missions',    label: 'Missions + mission-givers' },
  { value: 'gd:mission-giver',label: 'Mission Givers' },
  { value: 'gd:faction',     label: 'Factions' },
  { value: 'gd:poi',         label: 'POIs' },
  { value: 'gd:weapon-racks',label: 'Weapon Racks' },
  { value: 'gd:suit-lockers',label: 'Suit Lockers' },
  { value: 'gd:crafting',    label: 'Crafting' },
  { value: 'gd:trade',       label: 'Trade Commodities' },
  { value: 'gd:mining',      label: 'Mining' },
  { value: 'gd:law',         label: 'Law' },
  { value: 'gd:careers',     label: 'Careers' },
  { value: 'gd:reputation',  label: 'Reputation' },
  { value: 'gd:fps-gear',    label: 'FPS Gear' },
  // Top-level non-gd prefixes
  { value: 'ships:',         label: 'Ships (list + detail)' },
  { value: 'paints:',        label: 'Paints' },
  { value: 'loadout:',       label: 'Loadouts (components + modules)' },
  { value: 'loot:',          label: 'Loot (items, sets, locations)' },
  { value: 'contracts:',     label: 'Contracts (Wikelo/GFS/Ruto)' },
  { value: 'components:',    label: 'Components' },
  { value: 'renders:',       label: 'Renders (large view variants)' },
  { value: 'patches:',       label: 'Patches' },
  { value: 'localization:',  label: 'Localization' },
  { value: 'public-fleet:',  label: 'Public fleet share pages' },
  { value: '',               label: 'All Cache (danger)' },
]

// Each batch deletes up to ~900 keys; this caps a runaway loop, not a real purge.
const MAX_PURGE_BATCHES = 200

// "Purge failed: HTTP 403 Forbidden — <server error>" so the cause is visible
// instead of a bare "Purge failed".
async function describeFailure(res) {
  let reason = ''
  try {
    const data = await res.json()
    if (data?.error) reason = ` — ${data.error}`
  } catch {
    // Non-JSON body (e.g. a plain-text 411/413): the status is all we have.
  }
  return `Purge failed: HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${reason}`
}

function CachePurgePanel() {
  // Default to the safer "All Game Data" prefix (first entry). Users have to
  // explicitly select "All Cache (danger)" at the bottom of the list to nuke
  // everything. All purges go through ConfirmDialog (F274).
  const [prefix, setPrefix] = useState(CACHE_PREFIXES[0].value)
  const [purging, setPurging] = useState(false)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState(0)

  const selectedLabel = CACHE_PREFIXES.find((p) => p.value === prefix)?.label || prefix
  const isAllCache = prefix === ''

  const doPurge = async () => {
    setConfirming(false)
    setPurging(true)
    setResult(null)
    let deleted = 0
    try {
      // A Worker request can only spend ~1,000 KV operations, so the API
      // purges a large prefix in batches: repeat with the returned cursor
      // until it reports complete.
      let cursor = null
      for (let batch = 0; batch < MAX_PURGE_BATCHES; batch++) {
        const body = { ...(prefix ? { prefix } : {}), ...(cursor ? { cursor } : {}) }
        const res = await fetch('/api/admin/cache/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(await describeFailure(res))
        const data = await res.json()
        deleted += data.deleted
        setProgress(deleted)
        if (data.complete !== false || !data.cursor) {
          setResult({ type: 'success', message: `Purged ${deleted} key${deleted !== 1 ? 's' : ''}` })
          setTimeout(() => setResult(null), 4000)
          return
        }
        cursor = data.cursor
      }
      throw new Error(`Purge stopped after ${MAX_PURGE_BATCHES} batches; more keys remain`)
    } catch (err) {
      const partial = deleted > 0 ? ` (${deleted} key${deleted !== 1 ? 's' : ''} deleted before the failure)` : ''
      setResult({ type: 'error', message: `${err.message}${partial}` })
    } finally {
      setPurging(false)
      setProgress(0)
    }
  }

  return (
    <PanelSection title="KV Cache" icon={Trash2}>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="flex-1 px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
          >
            {CACHE_PREFIXES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.value ? ` (${p.value}*)` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setConfirming(true)}
            disabled={purging}
            className="btn-primary flex items-center gap-2 text-sm px-3 py-2 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {purging ? `Purging... ${progress || ''}`.trim() : 'Purge'}
          </button>
        </div>
        {result && (
          <p className={`text-xs font-mono ${result.type === 'success' ? 'text-sc-success' : 'text-sc-danger'}`}>
            {result.message}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onConfirm={doPurge}
        onCancel={() => setConfirming(false)}
        title={isAllCache ? 'Purge ALL Cache' : 'Purge Cache'}
        message={
          isAllCache
            ? 'This will drop every KV cache entry site-wide. The next request to each cached endpoint will hit the DB and write a fresh cache entry. Continue?'
            : `Purge KV entries matching "${prefix}*" (${selectedLabel})?`
        }
        confirmLabel={isAllCache ? 'Purge All Cache' : 'Purge'}
        variant={isAllCache ? 'danger' : 'warning'}
      />
    </PanelSection>
  )
}

export default function AdminCache() {
  // POST /api/admin/cache/purge is gated to super_admin (requireRole on
  // /api/admin/*), but the Admin pages are open to role `admin` too. Don't
  // offer a control that can only fail.
  const { data: session } = useSession()
  const role = session?.user?.role
  if (role !== 'super_admin') {
    return (
      <PanelSection title="KV Cache" icon={Trash2}>
        <p className="p-4 text-sm text-gray-400">
          Purging the KV cache requires the super_admin role. You are signed in as{' '}
          <span className="font-mono text-gray-200">{role || 'unknown'}</span>.
        </p>
      </PanelSection>
    )
  }
  return <CachePurgePanel />
}
