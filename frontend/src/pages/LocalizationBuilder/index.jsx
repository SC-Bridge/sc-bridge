import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Rocket, Tags, Sparkles, Eye, Download, Loader, Save, AlertCircle, CheckCircle, Search } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import {
  useLocalizationConfig,
  saveLocalizationConfig,
  useLocalizationShipOrder,
  saveLocalizationShipOrder,
  useFleet,
  useShips,
} from '../../hooks/useAPI'
import { LABEL_CATEGORIES, CATEGORY_FIELDS } from './constants'
import FleetOrderSection from './FleetOrderSection'
import ItemLabelsSection from './ItemLabelsSection'
import EnhancementsSection from './EnhancementsSection'
import PreviewDownloadSection from './PreviewDownloadSection'
import KeyBrowserSection from './KeyBrowserSection'
import WhatsChangedBanner from './WhatsChangedBanner'

// ── Pill nav ────────────────────────────────────────────────────────

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap cursor-pointer ${
        active
          ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
          : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── Sections ────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'fleet', label: 'Fleet Order', icon: Rocket },
  { key: 'labels', label: 'Item Labels', icon: Tags },
  { key: 'enhancements', label: 'Enhancements', icon: Sparkles },
  { key: 'keys', label: 'Key Browser', icon: Search },
  { key: 'preview', label: 'Preview & Download', icon: Eye },
]

// ── Main Page ───────────────────────────────────────────────────────

export default function LocalizationBuilder() {
  const { data: serverConfig, loading: configLoading, refetch: refetchConfig } = useLocalizationConfig()
  const { data: shipOrder, loading: orderLoading, refetch: refetchOrder } = useLocalizationShipOrder()
  const { data: fleet } = useFleet()
  const { data: allShips } = useShips()
  const [searchParams, setSearchParams] = useSearchParams()
  const [localConfig, setLocalConfig] = useState(null)
  const [orderedShips, setOrderedShips] = useState([])
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [shipSearch, setShipSearch] = useState('')

  const section = searchParams.get('section') || 'fleet'
  const config = localConfig || serverConfig || {}

  const setSection = useCallback((s) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (s === 'fleet') next.delete('section')
      else next.set('section', s)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // ── Init ship order (from saved only) ─────────────────────────────
  useEffect(() => {
    if (orderLoading) return
    if (shipOrder?.items?.length > 0) {
      setOrderedShips(shipOrder.items.map(item => ({
        vehicleId: item.vehicle_id,
        vehicleName: item.vehicle_name,
        customLabel: item.custom_label,
        sortPosition: item.sort_position,
      })))
    }
  }, [shipOrder, orderLoading])

  // ── Notification ──────────────────────────────────────────────────
  const showNotification = useCallback((msg, variant = 'info') => {
    setNotification({ msg, variant })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // ── Config helpers ────────────────────────────────────────────────
  const updateConfig = (patch) => {
    setLocalConfig(prev => ({ ...(prev || serverConfig || {}), ...patch }))
    setDirty(true)
  }

  const getCatFormat = (dbKey) => {
    const formats = config.categoryFormats || {}
    if (formats[dbKey]) return formats[dbKey]
    return { fields: [...(CATEGORY_FIELDS[dbKey] || [])], format: config.labelFormat || 'suffix' }
  }

  const updateCatFormat = (dbKey, fmt) => {
    const formats = { ...(config.categoryFormats || {}), [dbKey]: fmt }
    updateConfig({ categoryFormats: formats })
  }

  // ── Ship order helpers ────────────────────────────────────────────
  const renumber = (list) => list.map((s, i) => ({ ...s, sortPosition: i + 1 }))

  const handleShipReorder = useCallback((newList) => {
    setOrderedShips(renumber(newList))
    setDirty(true)
  }, [])

  const removeShip = (idx) => {
    setOrderedShips(renumber(orderedShips.filter((_, i) => i !== idx)))
    setDirty(true)
  }

  const addShip = (vehicle) => {
    if (orderedShips.some(s => s.vehicleId === vehicle.id)) return
    setOrderedShips(renumber([...orderedShips, {
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      customLabel: null,
      sortPosition: 0,
    }]))
    setShipSearch('')
    setDirty(true)
  }

  const addFromFleet = (fleetEntry) => {
    if (orderedShips.some(s => s.vehicleId === fleetEntry.vehicle_id)) return
    setOrderedShips(renumber([...orderedShips, {
      vehicleId: fleetEntry.vehicle_id,
      vehicleName: fleetEntry.vehicle_name,
      customLabel: fleetEntry.custom_name || null,
      sortPosition: 0,
    }]))
    setDirty(true)
  }

  // ── Save all ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      await saveLocalizationConfig(config)
      if (config.asopEnabled && orderedShips.length > 0) {
        await saveLocalizationShipOrder(
          orderedShips.map(s => ({
            vehicleId: s.vehicleId,
            sortPosition: s.sortPosition,
            customLabel: s.customLabel || null,
          }))
        )
        refetchOrder()
      }
      refetchConfig()
      setLocalConfig(null)
      setDirty(false)
      showNotification('Settings saved', 'success')
    } catch (e) {
      showNotification(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Download ──────────────────────────────────────────────────────
  const handleDownload = async () => {
    // Auto-save before downloading if dirty
    if (dirty) {
      try {
        await saveLocalizationConfig(config)
        if (config.asopEnabled && orderedShips.length > 0) {
          await saveLocalizationShipOrder(
            orderedShips.map(s => ({
              vehicleId: s.vehicleId,
              sortPosition: s.sortPosition,
              customLabel: s.customLabel || null,
            }))
          )
        }
      } catch (e) {
        showNotification('Save failed: ' + e.message, 'error')
        return
      }
    }

    setDownloading(true)
    try {
      const res = await fetch('/api/localization/download', { credentials: 'same-origin' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error || 'Download failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'global.ini'
      a.click()
      URL.revokeObjectURL(url)
      showNotification('Downloaded global.ini', 'success')
    } catch (e) {
      showNotification(e.message, 'error')
    } finally {
      setDownloading(false)
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────
  const enabledLabelCount = LABEL_CATEGORIES.filter(c => config[c.key]).length
  const enabledEnhancementCount = [config.enhanceContrabandWarnings, config.enhanceMaterialNames, config.enhanceBlueprintPools, config.enhanceContractRep].filter(Boolean).length
  const hasAnyEnabled = config.asopEnabled || enabledLabelCount > 0 || enabledEnhancementCount > 0

  if (configLoading) {
    return <div className="flex items-center justify-center py-20"><Loader className="w-5 h-5 animate-spin text-sc-accent" /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="LOCALIZATION BUILDER"
        subtitle="Customize your Star Citizen global.ini with personal overrides and community packs"
        actions={
          <div className="flex items-center gap-2">
            {dirty && (
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 cursor-pointer">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading || !hasAnyEnabled}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download
            </button>
          </div>
        }
      />

      {/* Notification */}
      {notification && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded text-sm ${
          notification.variant === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
          notification.variant === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
          'bg-blue-500/10 text-blue-400 border border-blue-500/20'
        }`}>
          {notification.variant === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
          {notification.variant === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {notification.msg}
        </div>
      )}

      {/* What's changed in the latest patch — renders nothing when
          there's no previous version to compare against. */}
      <WhatsChangedBanner />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Rocket} label="ASOP Ships" value={config.asopEnabled ? orderedShips.length : 'Off'} color={config.asopEnabled ? 'text-sc-accent' : 'text-gray-500'} />
        <StatCard icon={Tags} label="Label Categories" value={`${enabledLabelCount} / ${LABEL_CATEGORIES.length}`} color={enabledLabelCount > 0 ? 'text-sc-accent' : 'text-gray-500'} />
        <StatCard icon={Sparkles} label="Enhancements" value={`${enabledEnhancementCount} / 4`} color={enabledEnhancementCount > 0 ? 'text-purple-400' : 'text-gray-500'} />
        <StatCard icon={Download} label="Ready" value={hasAnyEnabled ? 'Yes' : 'No features enabled'} color={hasAnyEnabled ? 'text-emerald-400' : 'text-gray-500'} />
      </div>

      {/* Section pills */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map(s => (
          <Pill key={s.key} active={section === s.key} onClick={() => setSection(s.key)}>
            <span className="flex items-center gap-1.5">
              <s.icon className="w-3 h-3" />
              {s.label}
              {s.key === 'labels' && enabledLabelCount > 0 && (
                <span className="opacity-60">{enabledLabelCount}</span>
              )}
              {s.key === 'enhancements' && enabledEnhancementCount > 0 && (
                <span className="opacity-60">{enabledEnhancementCount}</span>
              )}
              {s.key === 'fleet' && config.asopEnabled && orderedShips.length > 0 && (
                <span className="opacity-60">{orderedShips.length}</span>
              )}
            </span>
          </Pill>
        ))}
      </div>

      {/* Active section */}
      {section === 'fleet' && (
        <FleetOrderSection
          config={config}
          orderedShips={orderedShips}
          allShips={allShips}
          fleet={fleet}
          shipSearch={shipSearch}
          setShipSearch={setShipSearch}
          onToggle={() => updateConfig({ asopEnabled: !config.asopEnabled })}
          onReorder={handleShipReorder}
          onRemove={removeShip}
          onAdd={addShip}
          onAddFromFleet={addFromFleet}
        />
      )}

      {section === 'labels' && (
        <ItemLabelsSection
          config={config}
          onUpdateConfig={updateConfig}
          getCatFormat={getCatFormat}
          onUpdateCatFormat={updateCatFormat}
        />
      )}

      {section === 'enhancements' && (
        <EnhancementsSection
          config={config}
          onUpdateConfig={updateConfig}
        />
      )}

      {section === 'keys' && <KeyBrowserSection />}

      {section === 'preview' && (
        <PreviewDownloadSection
          hasAnyEnabled={hasAnyEnabled}
          onDownload={handleDownload}
          downloading={downloading}
        />
      )}

      {/* Floating save bar */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm shadow-lg shadow-black/50 disabled:opacity-50 cursor-pointer">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Changes
          </button>
        </div>
      )}
    </div>
  )
}
