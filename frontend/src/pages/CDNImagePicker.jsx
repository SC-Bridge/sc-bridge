import React, { useState, useMemo, useRef } from 'react'
import { Upload, CheckCircle, Image, Palette, AlertCircle, X } from 'lucide-react'
import { applyCDNSelections } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import PanelSection from '../components/PanelSection'
import SearchInput from '../components/SearchInput'

// --- File upload drop zone ---

function DropZone({ label, icon: Icon, loaded, count, onFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        onFile(data)
      } catch {
        // invalid JSON — ignore
      }
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
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
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

// --- Single image thumbnail ---

function ImageThumb({ url, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 rounded overflow-hidden transition-all
        ${selected
          ? 'ring-2 ring-sc-accent ring-offset-1 ring-offset-sc-panel'
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
      {selected && (
        <span className="absolute top-1 right-1 bg-sc-accent rounded-full p-0.5">
          <CheckCircle className="w-3 h-3 text-white" />
        </span>
      )}
    </button>
  )
}

// --- Card for a single ship or paint ---

function ItemCard({ item, selected, onSelect }) {
  const images = item.images || []

  return (
    <div className="bg-sc-darker border border-sc-border rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{item.name}</span>
        <span className="text-xs text-gray-600 shrink-0">{images.length} img</span>
      </div>
      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <ImageThumb
              key={i}
              url={img.url}
              selected={selected === img.url}
              onClick={() => onSelect(item.name, selected === img.url ? null : img.url)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">No images</p>
      )}
    </div>
  )
}

// --- Main page ---

export default function CDNImagePicker() {
  const [shipsData, setShipsData] = useState(null)
  const [paintsData, setPaintsData] = useState(null)
  const [activeTab, setActiveTab] = useState('ships')
  const [shipSelections, setShipSelections] = useState({})   // name → imageURL
  const [paintSelections, setPaintSelections] = useState({}) // name → imageURL
  const [search, setSearch] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const activeItems = activeTab === 'ships' ? shipsData?.ships : paintsData?.paints
  const activeSelections = activeTab === 'ships' ? shipSelections : paintSelections
  const setActiveSelections = activeTab === 'ships' ? setShipSelections : setPaintSelections

  const filtered = useMemo(() => {
    if (!activeItems) return []
    const q = search.toLowerCase()
    return q ? activeItems.filter(i => i.name.toLowerCase().includes(q)) : activeItems
  }, [activeItems, search])

  const shipCount = Object.keys(shipSelections).length
  const paintCount = Object.keys(paintSelections).length
  const totalSelected = shipCount + paintCount

  const handleSelect = (name, imageURL) => {
    setActiveSelections(prev => {
      const next = { ...prev }
      if (imageURL === null) {
        delete next[name]
      } else {
        next[name] = imageURL
      }
      return next
    })
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    setResult(null)
    try {
      const ships = Object.entries(shipSelections).map(([name, imageURL]) => ({ name, imageURL }))
      const paints = Object.entries(paintSelections).map(([name, imageURL]) => ({ name, imageURL }))
      const res = await applyCDNSelections({ ships, paints })
      setResult(res)
    } catch (err) {
      setError(err.message || 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  const noData = !shipsData && !paintsData

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="CDN IMAGE PICKER"
        subtitle="Review and select primary images from CDN crawl data"
        actions={
          totalSelected > 0 && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="btn-primary flex items-center gap-2"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {applying ? 'Applying...' : `Apply Selected (${totalSelected})`}
            </button>
          )
        }
      />

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

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* File upload */}
      <PanelSection title="Load CDN Export Files">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DropZone
            label="ships.json"
            icon={Image}
            loaded={!!shipsData}
            count={shipsData?.ships?.length}
            onFile={(data) => { setShipsData(data); setShipSelections({}) }}
          />
          <DropZone
            label="paints.json"
            icon={Palette}
            loaded={!!paintsData}
            count={paintsData?.paints?.length}
            onFile={(data) => { setPaintsData(data); setPaintSelections({}) }}
          />
        </div>
      </PanelSection>

      {/* Image picker */}
      {!noData && (
        <PanelSection>
          {/* Tabs + search */}
          <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-sc-border/50">
            <div className="flex gap-1">
              {shipsData && (
                <button
                  onClick={() => { setActiveTab('ships'); setSearch('') }}
                  className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                    activeTab === 'ships'
                      ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                      : 'text-gray-400 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  Ships ({shipsData.ships.length})
                  {shipCount > 0 && <span className="ml-1.5 text-sc-accent">·{shipCount}</span>}
                </button>
              )}
              {paintsData && (
                <button
                  onClick={() => { setActiveTab('paints'); setSearch('') }}
                  className={`px-3 py-1.5 rounded text-xs font-display tracking-wide uppercase transition-colors ${
                    activeTab === 'paints'
                      ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/30'
                      : 'text-gray-400 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  Paints ({paintsData.paints.length})
                  {paintCount > 0 && <span className="ml-1.5 text-sc-accent">·{paintCount}</span>}
                </button>
              )}
            </div>
            <div className="flex-1">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${activeTab}…`}
              />
            </div>
            {activeItems && (
              <span className="text-xs text-gray-500 shrink-0">
                {filtered.length} / {activeItems.length}
              </span>
            )}
          </div>

          {/* Card grid */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <ItemCard
                key={item.name}
                item={item}
                selected={activeSelections[item.name] ?? null}
                onSelect={handleSelect}
              />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-gray-500 text-sm py-8">
                {search ? 'No matches for your search.' : 'No items loaded.'}
              </p>
            )}
          </div>
        </PanelSection>
      )}

      {noData && (
        <div className="text-center text-gray-500 text-sm py-12">
          <Upload className="w-8 h-8 mx-auto mb-3 text-gray-700" />
          <p>Load ships.json and/or paints.json from the cdn-sync export above to get started.</p>
        </div>
      )}
    </div>
  )
}
