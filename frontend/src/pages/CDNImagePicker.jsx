import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Upload, CheckCircle, Image, Palette, AlertCircle, X, ChevronRight, Save, Layers } from 'lucide-react'
import { applyCDNSelections, useCDNExistingImages } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import PanelSection from '../components/PanelSection'
import SearchInput from '../components/SearchInput'

const LS_KEY_SHIPS = 'cdn_picker_ship_candidates'
const LS_KEY_PAINTS = 'cdn_picker_paint_candidates'

function loadFromLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function saveToLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// Merge items that have the same name (case-insensitive), combining their images
function deduplicateItems(items) {
  if (!items) return []
  const seen = new Map() // lowercase name → index in result
  const result = []
  for (const item of items) {
    const key = item.name.toLowerCase()
    if (seen.has(key)) {
      const existing = result[seen.get(key)]
      const existingUrls = new Set((existing.images || []).map(i => i.url))
      const newImages = (item.images || []).filter(i => !existingUrls.has(i.url))
      existing.images = [...(existing.images || []), ...newImages]
    } else {
      seen.set(key, result.length)
      result.push({ ...item, images: [...(item.images || [])] })
    }
  }
  return result
}

// Merge candidate entries that differ only by case, combining their URL arrays
function deduplicateCandidates(candidates) {
  if (!candidates) return {}
  const result = {}
  const keyMap = {} // lowercase → canonical key already stored
  for (const [name, urls] of Object.entries(candidates)) {
    const lower = name.toLowerCase()
    if (lower in keyMap) {
      const canon = keyMap[lower]
      const existing = new Set(result[canon])
      result[canon] = [...result[canon], ...urls.filter(u => !existing.has(u))]
    } else {
      keyMap[lower] = name
      result[name] = [...urls]
    }
  }
  return result
}

// --- File drop zone ---

function DropZone({ label, icon: Icon, loaded, count, onFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try { onFile(JSON.parse(e.target.result)) } catch { /* invalid JSON */ }
    }
    reader.readAsText(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      onClick={() => !loaded && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2 p-6 rounded border-2 border-dashed transition-all cursor-pointer
        ${loaded
          ? 'border-sc-success/40 bg-sc-success/5 cursor-default'
          : dragging
            ? 'border-sc-accent bg-sc-accent/10'
            : 'border-sc-border hover:border-sc-accent/50 hover:bg-white/[0.02]'
        }`}
    >
      <input ref={inputRef} type="file" accept=".json" className="hidden"
        onChange={(e) => handleFile(e.target.files[0])} />
      {loaded ? (
        <>
          <CheckCircle className="w-6 h-6 text-sc-success" />
          <span className="text-sm text-sc-success font-medium">{label} loaded</span>
          <span className="text-xs text-gray-500">{count} items</span>
        </>
      ) : (
        <>
          <Icon className="w-6 h-6 text-gray-500" />
          <span className="text-sm text-gray-400">{label}</span>
          <span className="text-xs text-gray-600">Drop .json or click to browse</span>
        </>
      )}
    </div>
  )
}

// --- Image thumbnail ---

function ImageThumb({ url, state, label, onClick }) {
  // state: null | 'candidate' | 'primary'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 rounded overflow-hidden transition-all
        ${state === 'primary'
          ? 'ring-2 ring-sc-accent ring-offset-2 ring-offset-sc-panel'
          : state === 'candidate'
            ? 'ring-2 ring-sc-warn/70 ring-offset-1 ring-offset-sc-panel'
            : 'ring-1 ring-sc-border hover:ring-sc-accent/50'
        }`}
      style={{ width: 160, height: 90 }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        onError={(e) => { e.currentTarget.style.opacity = '0.2' }}
      />
      {label && (
        <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[10px] font-mono text-gray-300 leading-none">
          {label}
        </span>
      )}
      {state === 'primary' && (
        <span className="absolute top-1 right-1 bg-sc-accent rounded-full p-0.5">
          <CheckCircle className="w-3 h-3 text-white" />
        </span>
      )}
      {state === 'candidate' && (
        <span className="absolute top-1 right-1 bg-sc-warn/90 rounded-full p-0.5">
          <Layers className="w-3 h-3 text-white" />
        </span>
      )}
    </button>
  )
}

// --- Phase 1 card: multi-select candidates ---

function SelectCard({ item, candidates, currentImage, onToggle }) {
  const cdnImages = item.images || []
  // Show current image first (if it's not already in the CDN list), then CDN images
  const cdnUrls = new Set(cdnImages.map(i => i.url))
  const showCurrentSeparately = currentImage && !cdnUrls.has(currentImage)
  const allImages = [
    ...(showCurrentSeparately ? [{ url: currentImage, label: 'current' }] : []),
    ...cdnImages.map(i => ({
      url: i.url,
      label: currentImage && i.url === currentImage ? 'current' : null,
    })),
  ]
  const count = candidates.length

  return (
    <div className={`bg-sc-darker border rounded p-3 space-y-2 transition-colors ${
      count > 0 ? 'border-sc-warn/40' : 'border-sc-border'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{item.name}</span>
        <span className={`text-xs shrink-0 ${count > 0 ? 'text-sc-warn' : 'text-gray-600'}`}>
          {count > 0 ? `${count} selected` : `${allImages.length} img`}
        </span>
      </div>
      {allImages.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allImages.map((img, i) => (
            <ImageThumb
              key={i}
              url={img.url}
              label={img.label}
              state={candidates.includes(img.url) ? 'candidate' : null}
              onClick={() => onToggle(item.name, img.url)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">No images</p>
      )}
    </div>
  )
}

// --- Phase 2 card: pick primary from saved candidates ---

function PrimaryCard({ name, candidates, primary, currentImage, onPick }) {
  return (
    <div className={`bg-sc-darker border rounded p-3 space-y-2 transition-colors ${
      primary ? 'border-sc-accent/40' : 'border-sc-warn/30'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{name}</span>
        <span className={`text-xs shrink-0 ${primary ? 'text-sc-accent' : 'text-gray-500'}`}>
          {primary ? 'primary set' : `${candidates.length} candidates`}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {candidates.map((url, i) => (
          <ImageThumb
            key={i}
            url={url}
            label={currentImage && url === currentImage ? 'current' : null}
            state={primary === url ? 'primary' : 'candidate'}
            onClick={() => onPick(name, primary === url ? null : url)}
          />
        ))}
      </div>
    </div>
  )
}

// --- Main page ---

export default function CDNImagePicker() {
  const [phase, setPhase] = useState('select') // 'select' | 'primary'

  // Existing D1 images — keyed by lowercase name
  const { data: existingData } = useCDNExistingImages()
  const shipImageMap = useMemo(() => {
    if (!existingData?.ships) return {}
    return Object.fromEntries(existingData.ships.map(s => [s.name.toLowerCase(), s.image_url]))
  }, [existingData])
  const paintImageMap = useMemo(() => {
    if (!existingData?.paints) return {}
    return Object.fromEntries(existingData.paints.map(p => [p.name.toLowerCase(), p.image_url]))
  }, [existingData])

  // Phase 1 — loaded JSON data
  const [shipsData, setShipsData] = useState(null)
  const [paintsData, setPaintsData] = useState(null)

  // Phase 1 — multi-select candidates: { [name]: string[] }
  const [shipCandidates, setShipCandidates] = useState(() => deduplicateCandidates(loadFromLS(LS_KEY_SHIPS)) || {})
  const [paintCandidates, setPaintCandidates] = useState(() => deduplicateCandidates(loadFromLS(LS_KEY_PAINTS)) || {})

  // Phase 2 — single primary per item: { [name]: string }
  const [shipPrimaries, setShipPrimaries] = useState({})
  const [paintPrimaries, setPaintPrimaries] = useState({})

  const [activeTab, setActiveTab] = useState('ships')
  const [search, setSearch] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [applyError, setApplyError] = useState(null)

  // Auto-switch to primary phase if we already have saved candidates
  useEffect(() => {
    const hasCandidates =
      Object.keys(shipCandidates).length > 0 || Object.keys(paintCandidates).length > 0
    if (hasCandidates) setPhase('primary')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Phase 1 helpers ---

  const toggleCandidate = (type, name, url) => {
    const setter = type === 'ships' ? setShipCandidates : setPaintCandidates
    setter(prev => {
      const current = prev[name] || []
      const next = current.includes(url)
        ? current.filter(u => u !== url)
        : [...current, url]
      return next.length > 0 ? { ...prev, [name]: next } : (({ [name]: _, ...rest }) => rest)(prev)
    })
  }

  const saveSelections = () => {
    saveToLS(LS_KEY_SHIPS, shipCandidates)
    saveToLS(LS_KEY_PAINTS, paintCandidates)
    setPhase('primary')
  }

  const clearSelections = () => {
    setShipCandidates({})
    setPaintCandidates({})
    setShipPrimaries({})
    setPaintPrimaries({})
    localStorage.removeItem(LS_KEY_SHIPS)
    localStorage.removeItem(LS_KEY_PAINTS)
    setPhase('select')
  }

  // --- Phase 2 helpers ---

  const setPrimary = (type, name, url) => {
    const setter = type === 'ships' ? setShipPrimaries : setPaintPrimaries
    setter(prev => {
      if (url === null) {
        const { [name]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [name]: url }
    })
  }

  const handleApply = async () => {
    setApplying(true)
    setApplyError(null)
    setResult(null)
    try {
      const ships = Object.entries(shipPrimaries).map(([name, imageURL]) => ({ name, imageURL }))
      const paints = Object.entries(paintPrimaries).map(([name, imageURL]) => ({ name, imageURL }))
      const res = await applyCDNSelections({ ships, paints })
      setResult(res)
    } catch (err) {
      setApplyError(err.message || 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  // --- Derived counts ---

  const shipCandidateCount = Object.keys(shipCandidates).length
  const paintCandidateCount = Object.keys(paintCandidates).length
  const totalCandidates = shipCandidateCount + paintCandidateCount
  const shipPrimaryCount = Object.keys(shipPrimaries).length
  const paintPrimaryCount = Object.keys(paintPrimaries).length
  const totalPrimaries = shipPrimaryCount + paintPrimaryCount

  // --- Phase 1 filtered items ---

  const phase1Items = useMemo(
    () => deduplicateItems(activeTab === 'ships' ? shipsData?.ships : paintsData?.paints),
    [activeTab, shipsData, paintsData]
  )
  const filteredPhase1 = useMemo(() => {
    if (!phase1Items.length) return []
    const q = search.toLowerCase()
    return q ? phase1Items.filter(i => i.name.toLowerCase().includes(q)) : phase1Items
  }, [phase1Items, search])

  // --- Phase 2 filtered items (from saved candidates) ---

  const phase2Source = activeTab === 'ships' ? shipCandidates : paintCandidates
  const phase2Primaries = activeTab === 'ships' ? shipPrimaries : paintPrimaries
  const filteredPhase2 = useMemo(() => {
    const entries = Object.entries(phase2Source)
    const q = search.toLowerCase()
    return q ? entries.filter(([name]) => name.toLowerCase().includes(q)) : entries
  }, [phase2Source, search])

  const noPhase1Data = !shipsData && !paintsData

  // ===== RENDER =====

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="CDN IMAGE PICKER"
        subtitle={phase === 'select' ? 'Phase 1 — select candidate images' : 'Phase 2 — pick a primary image'}
        actions={
          phase === 'select' ? (
            totalCandidates > 0 && (
              <button onClick={saveSelections} className="btn-primary flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                Save &amp; Go to Phase 2 ({totalCandidates})
              </button>
            )
          ) : (
            totalPrimaries > 0 && (
              <button onClick={handleApply} disabled={applying} className="btn-primary flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                {applying ? 'Applying...' : `Apply Primary (${totalPrimaries})`}
              </button>
            )
          )
        }
      />

      {/* Phase toggle strip */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPhase('select')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
            phase === 'select'
              ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
              : 'text-gray-500 border border-transparent hover:text-gray-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Phase 1 · Select Candidates
          {totalCandidates > 0 && <span className="text-sc-warn">({totalCandidates})</span>}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
        <button
          onClick={() => totalCandidates > 0 && setPhase('primary')}
          disabled={totalCandidates === 0}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
            phase === 'primary'
              ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
              : totalCandidates > 0
                ? 'text-gray-500 border border-transparent hover:text-gray-300'
                : 'text-gray-700 border border-transparent cursor-not-allowed'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Phase 2 · Pick Primary
          {totalPrimaries > 0 && <span className="text-sc-accent">({totalPrimaries})</span>}
        </button>
        {totalCandidates > 0 && (
          <button
            onClick={clearSelections}
            className="ml-auto text-xs text-gray-600 hover:text-sc-danger transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className="flex items-start gap-3 p-4 bg-sc-success/10 border border-sc-success/30 rounded">
          <CheckCircle className="w-5 h-5 text-sc-success shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="text-sc-success font-medium">Applied successfully</p>
            {result.ships?.total > 0 && (
              <p className="text-gray-400">Ships: {result.ships.matched} updated, {result.ships.skipped} skipped</p>
            )}
            {result.paints?.total > 0 && (
              <p className="text-gray-400">Paints: {result.paints.matched} updated, {result.paints.skipped} skipped</p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="ml-auto text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {applyError && (
        <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{applyError}</span>
        </div>
      )}

      {/* ===== PHASE 1 ===== */}
      {phase === 'select' && (
        <>
          {/* File upload */}
          <PanelSection title="Load CDN Export Files">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DropZone label="ships.json" icon={Image} loaded={!!shipsData}
                count={shipsData?.ships ? deduplicateItems(shipsData.ships).length : undefined}
                onFile={(data) => { setShipsData(data); setShipCandidates({}) }} />
              <DropZone label="paints.json" icon={Palette} loaded={!!paintsData}
                count={paintsData?.paints ? deduplicateItems(paintsData.paints).length : undefined}
                onFile={(data) => { setPaintsData(data); setPaintCandidates({}) }} />
            </div>
            <p className="px-4 pb-4 text-xs text-gray-600">
              Click or tap images to add them as candidates. You can select multiple per ship. Hit "Save &amp; Go to Phase 2" when done.
            </p>
          </PanelSection>

          {!noPhase1Data && (
            <PanelSection>
              <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-sc-border/50">
                <div className="flex gap-1">
                  {shipsData && (
                    <button onClick={() => { setActiveTab('ships'); setSearch('') }}
                      className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                        activeTab === 'ships'
                          ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                          : 'text-gray-400 hover:text-gray-300 border border-transparent'
                      }`}>
                      Ships ({shipsData.ships.length})
                      {shipCandidateCount > 0 && <span className="ml-1 text-sc-warn">·{shipCandidateCount}</span>}
                    </button>
                  )}
                  {paintsData && (
                    <button onClick={() => { setActiveTab('paints'); setSearch('') }}
                      className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                        activeTab === 'paints'
                          ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                          : 'text-gray-400 hover:text-gray-300 border border-transparent'
                      }`}>
                      Paints ({paintsData.paints.length})
                      {paintCandidateCount > 0 && <span className="ml-1 text-sc-warn">·{paintCandidateCount}</span>}
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${activeTab}…`} />
                </div>
                <span className="text-xs text-gray-500 shrink-0">
                  {filteredPhase1.length} / {phase1Items?.length ?? 0}
                </span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredPhase1.map((item) => {
                  const candidates = (activeTab === 'ships' ? shipCandidates : paintCandidates)[item.name] || []
                  const imageMap = activeTab === 'ships' ? shipImageMap : paintImageMap
                  const currentImage = imageMap[item.name.toLowerCase()] ?? null
                  return (
                    <SelectCard
                      key={item.name}
                      item={item}
                      candidates={candidates}
                      currentImage={currentImage}
                      onToggle={(name, url) => toggleCandidate(activeTab, name, url)}
                    />
                  )
                })}
                {filteredPhase1.length === 0 && (
                  <p className="col-span-full text-center text-gray-500 text-sm py-8">
                    {search ? 'No matches.' : 'No items loaded.'}
                  </p>
                )}
              </div>
            </PanelSection>
          )}

          {noPhase1Data && (
            <div className="text-center text-gray-500 text-sm py-12">
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-700" />
              <p>Load ships.json and/or paints.json from the cdn-sync export above.</p>
            </div>
          )}
        </>
      )}

      {/* ===== PHASE 2 ===== */}
      {phase === 'primary' && (
        <PanelSection>
          <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-sc-border/50">
            <div className="flex gap-1">
              {shipCandidateCount > 0 && (
                <button onClick={() => { setActiveTab('ships'); setSearch('') }}
                  className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                    activeTab === 'ships'
                      ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                      : 'text-gray-400 hover:text-gray-300 border border-transparent'
                  }`}>
                  Ships ({shipCandidateCount})
                  {shipPrimaryCount > 0 && <span className="ml-1 text-sc-accent">·{shipPrimaryCount}</span>}
                </button>
              )}
              {paintCandidateCount > 0 && (
                <button onClick={() => { setActiveTab('paints'); setSearch('') }}
                  className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                    activeTab === 'paints'
                      ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                      : 'text-gray-400 hover:text-gray-300 border border-transparent'
                  }`}>
                  Paints ({paintCandidateCount})
                  {paintPrimaryCount > 0 && <span className="ml-1 text-sc-accent">·{paintPrimaryCount}</span>}
                </button>
              )}
            </div>
            <div className="flex-1">
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${activeTab}…`} />
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {filteredPhase2.length} / {Object.keys(phase2Source).length}
            </span>
          </div>
          <p className="px-4 pt-3 text-xs text-gray-600">
            These are your saved candidates. Click one image per ship to mark it as the primary, then hit Apply.
          </p>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPhase2.map(([name, candidates]) => {
              const imageMap = activeTab === 'ships' ? shipImageMap : paintImageMap
              const currentImage = imageMap[name.toLowerCase()] ?? null
              return (
                <PrimaryCard
                  key={name}
                  name={name}
                  candidates={candidates}
                  primary={phase2Primaries[name] ?? null}
                  currentImage={currentImage}
                  onPick={(n, url) => setPrimary(activeTab, n, url)}
                />
              )
            })}
            {filteredPhase2.length === 0 && (
              <p className="col-span-full text-center text-gray-500 text-sm py-8">
                {search ? 'No matches.' : 'No candidates saved yet — go back to Phase 1.'}
              </p>
            )}
          </div>
        </PanelSection>
      )}
    </div>
  )
}
