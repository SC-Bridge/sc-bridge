import React, { useState, useRef, useEffect } from 'react'
import { RefreshCw, Users, HardDrive } from 'lucide-react'
import { useStatus, usePreferences, setPreferences, useUserSyncStatus, deleteSyncData, useCharacters } from '../../hooks/useAPI'
import useHangarSync, { SYNC_CATEGORIES } from '../../hooks/useHangarSync'
import ConfirmDialog from '../../components/ConfirmDialog'
import SyncMappingDialog from './SyncMappingDialog'
import SyncSection from './SyncSection'
import SyncDataSection from './SyncDataSection'
import CharacterBackup from './CharacterBackup'
import LegacyImport from './LegacyImport'
import ExtensionSection from './ExtensionSection'

// Animated stat number — same pattern as Crafting/StatsRow
function AnimatedNumber({ value, duration = 600 }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (typeof value !== 'number' || value === 0) { setDisplay(value); return }
    const start = performance.now()
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) ref.current = requestAnimationFrame(tick)
    }
    ref.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(ref.current)
  }, [value, duration])

  return <span>{display.toLocaleString()}</span>
}

function StatCard({ icon: Icon, label, value, suffix, delay = 0 }) {
  return (
    <div
      className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-4 shadow-lg shadow-black/20 animate-stagger-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-sc-accent/10">
          <Icon className="w-4 h-4 text-sc-accent" />
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
          <p
            className="text-2xl font-bold text-white"
            style={{ textShadow: '0 0 12px rgba(34, 211, 238, 0.3)' }}
          >
            <AnimatedNumber value={value} />
            {suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Import() {
  const { data: appStatus } = useStatus()
  const sync = useHangarSync()
  const { data: preferences, refetch: refetchPrefs } = usePreferences()
  const { data: syncStatus, refetch: refetchSyncStatus } = useUserSyncStatus()
  const { data: charData } = useCharacters()
  const [notification, setNotification] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false })
  const [syncCategories, setSyncCategories] = useState(() =>
    Object.fromEntries(Object.entries(SYNC_CATEGORIES).map(([k, v]) => [k, v.default]))
  )
  const notifTimer = useRef(null)

  useEffect(() => () => clearTimeout(notifTimer.current), [])

  const showNotification = (msg, variant = 'info') => {
    clearTimeout(notifTimer.current)
    setNotification({ msg, variant })
    notifTimer.current = setTimeout(() => setNotification(null), 3000)
  }

  const handleSyncClick = () => {
    setSyncCategories(Object.fromEntries(Object.entries(SYNC_CATEGORIES).map(([k, v]) => [k, v.default])))
    setConfirmDialog({
      open: true,
      title: 'Hangar Sync',
      message: 'sync-categories',
      variant: 'info',
      confirmLabel: 'Sync Now',
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        try {
          if (!preferences?.sync_consent) {
            await setPreferences({ sync_consent: new Date().toISOString() })
            refetchPrefs()
          }
          sync.startSync(syncCategories)
        } catch (err) {
          showNotification('Failed to start sync: ' + err.message, 'error')
        }
      },
    })
  }

  const handleDeleteSyncData = () => {
    setConfirmDialog({
      open: true,
      title: 'Delete All Synced Data',
      message: `This will permanently remove all data synced from RSI:\n\n\u2022 ${syncStatus?.fleet_count || 0} fleet ships\n\u2022 ${syncStatus?.buyback_count || 0} buy-back pledges\n\u2022 RSI profile data\n\u2022 Sync consent\n\nThis cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete All Synced Data',
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        try {
          const result = await deleteSyncData()
          refetchSyncStatus()
          refetchPrefs()
          showNotification(
            `Deleted ${result.fleet_deleted} ships, ${result.buyback_deleted} buy-back pledges${result.profile_deleted ? ', and RSI profile' : ''}`,
            'success'
          )
        } catch (err) {
          showNotification('Failed to delete sync data: ' + err.message, 'error')
        }
      },
    })
  }

  const fleetCount = appStatus?.vehicles || 0
  const characterCount = charData?.characters?.length || 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8 animate-fade-in-up">
      {/* Hero */}
      <div className="relative">
        <div className="absolute -top-1 -left-1 w-4 h-4 border-t border-l border-sc-accent/20" />
        <div className="absolute -top-1 -right-1 w-4 h-4 border-t border-r border-sc-accent/20" />
        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b border-l border-sc-accent/20" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b border-r border-sc-accent/20" />

        <div className="py-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-sc-accent/60 mb-2 font-mono">
            Star Citizen · Data Management
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold text-white tracking-wide mb-2"
            style={{ textShadow: '0 0 30px rgba(34, 211, 238, 0.2)' }}
          >
            Sync & Import
          </h1>
          <p className="text-sm text-gray-500">
            Manage your RSI hangar data, character backups, and extension sync.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={RefreshCw} label="Ships Synced" value={fleetCount} delay={0} />
        <StatCard icon={Users} label="Characters Saved" value={characterCount} delay={60} />
        <StatCard icon={HardDrive} label="Last Sync" value={syncStatus?.last_synced ? 1 : 0} suffix={syncStatus?.last_synced ? 'active' : 'never'} delay={120} />
      </div>

      {/* SC Bridge Sync */}
      <SyncSection
        sync={sync}
        syncCategories={syncCategories}
        onSyncClick={handleSyncClick}
        SYNC_CATEGORIES={SYNC_CATEGORIES}
      />

      {/* Sync Data */}
      <SyncDataSection
        syncStatus={syncStatus}
        onDelete={handleDeleteSyncData}
        notification={notification}
      />

      {/* Character Backup */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400 flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-sc-accent" />
          Character Backup
        </h2>
        <p className="text-sm text-gray-500">
          Back up your Star Citizen character files. Upload <span className="font-mono text-gray-400">.chf</span> files from <span className="font-mono text-gray-400">StarCitizen\LIVE\user\client\0\CustomCharacters\</span>
        </p>
        <CharacterBackup />
      </div>

      {/* Legacy Import */}
      <LegacyImport />

      {/* Extension */}
      <ExtensionSection />

      <SyncMappingDialog mapping={sync.status === 'needs_mapping' ? sync.mapping : null} onResolve={sync.resolveMapping} onCancel={sync.cancelMapping} />

      {/* Sync Categories Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog({ open: false })}
        title={confirmDialog.title}
        message={confirmDialog.message !== 'sync-categories' ? confirmDialog.message : undefined}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
      >
        {confirmDialog.message === 'sync-categories' && (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-gray-400">
              Choose which data to sync from your RSI account.
            </p>
            <div className="space-y-1.5">
              {Object.entries(SYNC_CATEGORIES).map(([key, cat]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-2.5 rounded border cursor-pointer transition-colors ${
                    syncCategories[key]
                      ? 'border-sc-accent/40 bg-sc-accent/5'
                      : 'border-sc-border/50 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={syncCategories[key]}
                    onChange={(e) => setSyncCategories(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="mt-0.5 accent-sc-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{cat.label}</div>
                    <div className="text-xs text-gray-500">{cat.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
