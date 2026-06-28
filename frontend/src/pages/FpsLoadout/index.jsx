import React, { useState, useMemo } from 'react'
import { useFpsGear } from '../../hooks/useAPI'
import WeaponBenchContainer from './WeaponBenchContainer'

const ICON = (name) => `/inventory-assets/${name}`

// CSS filter to tint dark SVG icons → cyan (matches in-game)
// Normalize any SVG fill to bright cyan: first flatten to white, then tint
const ICO_FILTER_BRIGHT = 'brightness(0) saturate(100%) invert(85%) sepia(30%) saturate(1000%) hue-rotate(155deg) brightness(1.1)'
const ICO_FILTER_ACTIVE = 'brightness(0) saturate(100%) invert(85%) sepia(30%) saturate(1000%) hue-rotate(155deg) brightness(1.1) drop-shadow(0 0 3px rgba(0,232,255,0.6))'
const ICO_FILTER_DEFAULT = 'brightness(0) saturate(100%) invert(70%) sepia(20%) saturate(600%) hue-rotate(155deg) brightness(0.9)'
const ICO_FILTER_DIM = 'brightness(0) saturate(100%) invert(60%) sepia(20%) saturate(500%) hue-rotate(155deg) brightness(0.7)'

function Ico({ src, size = '1.2vw', dim = false, active = false, muted = false, className = '' }) {
  const filter = active ? ICO_FILTER_ACTIVE : dim ? ICO_FILTER_DIM : muted ? ICO_FILTER_DEFAULT : ICO_FILTER_BRIGHT
  const opacity = dim ? 0.35 : muted ? 0.6 : 1
  return (
    <img
      src={ICON(src)}
      alt=""
      className={className}
      style={{
        width: size, height: size,
        filter,
        opacity,
      }}
    />
  )
}

function HazardSep({ thin = false, label = null }) {
  const h = thin ? 'h-2' : 'h-3'
  const opacity = thin ? '0.06' : '0.1'
  return (
    <div className={`flex items-center ${h} my-0.5`}>
      <div className="flex-1 h-full" style={{ background: `repeating-linear-gradient(135deg,rgba(192,246,254,${opacity}) 0px,rgba(192,246,254,${opacity}) 4px,transparent 4px,transparent 8px)` }} />
      {label ? (
        <>
          <div className="w-0.5 h-full flex-shrink-0" style={{ background: 'rgba(192,246,254,0.5)' }} />
          <span className="px-3 flex-shrink-0 text-[10px] tracking-[0.2em] uppercase" style={{ color: 'rgba(192,246,254,0.7)' }}>{label}</span>
          <div className="w-0.5 h-full flex-shrink-0" style={{ background: 'rgba(192,246,254,0.5)' }} />
        </>
      ) : null}
      <div className="flex-1 h-full" style={{ background: `repeating-linear-gradient(45deg,rgba(192,246,254,${opacity}) 0px,rgba(192,246,254,${opacity}) 4px,transparent 4px,transparent 8px)` }} />
    </div>
  )
}

function EquipSlot({ icon, size = '2.4vw', badge = null, children }) {
  return (
    <div
      className="flex items-center justify-center cursor-pointer relative"
      style={{
        height: '5.93vh',
        background: 'rgba(0,18,28,0.6)',
        border: '1px solid rgba(0,200,230,0.15)',
        borderRadius: 4,
      }}
    >
      <Ico src={icon} size={size} dim />
      {badge && (
        <span
          className="absolute flex items-center justify-center font-mono"
          style={{
            bottom: '0.4vh', right: '0.4vw',
            width: '1.1vw', height: '1.1vw',
            borderRadius: '50%',
            border: '1px solid rgba(192,246,254,0.3)',
            background: 'rgba(0,6,15,0.6)',
            fontSize: '0.75vw',
            color: 'rgba(192,246,254,0.6)',
          }}
        >{badge}</span>
      )}
      {children}
    </div>
  )
}

function EquipmentPanel({ equipTab, setEquipTab }) {
  return (
    <div className="flex flex-col h-full">
      {/* Equipped gear list (placeholder for now) */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0.93vh 0.73vw' }}>
        <div className="text-[0.72vw] tracking-[0.16vw] uppercase mb-1">
          PERSONAL<span className="mx-1" style={{ color: 'rgba(192,246,254,0.3)' }}>/</span><span style={{ color: '#00e8ff' }}>ALL</span>
        </div>
        <div className="flex-1 flex items-center justify-center" style={{ minHeight: '20vh', color: 'rgba(192,246,254,0.25)', fontSize: '0.57vw', letterSpacing: '0.16vw', textTransform: 'uppercase' }}>
          DRAG GEAR TO EQUIP
        </div>
      </div>

      {/* Bottom equipment slots */}
      <div className="flex flex-shrink-0" style={{ padding: '0 0.73vw 0.93vh' }}>
        {/* Tab buttons */}
        <div className="flex flex-col gap-0.5 flex-shrink-0" style={{ width: '3vw' }}>
          <button
            onClick={() => setEquipTab('weapons')}
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: '2.7vw', height: '3.9vh',
              border: `1px solid rgba(0,232,255,${equipTab === 'weapons' ? 0.3 : 0.1})`,
              background: equipTab === 'weapons' ? 'rgba(0,232,255,0.08)' : 'transparent',
            }}
          >
            <Ico src="icon_common_sidearm.svg" dim={equipTab !== 'weapons'} />
          </button>
          <button
            onClick={() => setEquipTab('gadgets')}
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: '2.7vw', height: '3.9vh',
              border: `1px solid rgba(0,232,255,${equipTab === 'gadgets' ? 0.3 : 0.1})`,
              background: equipTab === 'gadgets' ? 'rgba(0,232,255,0.08)' : 'transparent',
            }}
          >
            <Ico src="icon_common_utility.svg" dim={equipTab !== 'gadgets'} />
          </button>
        </div>

        {/* Slot grids — fixed height so switching tabs doesn't jump */}
        <div className="flex-1 flex flex-col">
          <HazardSep label="EQUIPMENT" />

          <div className="flex-1 flex flex-col justify-between">
            {equipTab === 'weapons' ? (
              <>
                <EquipSlot icon="icon_inventory_handheld.svg" />
                <HazardSep />
                <div className="flex gap-[0.16vw]" style={{ height: '5.93vh' }}>
                  <div className="flex-[2]"><EquipSlot icon="icon_common_primary_weapon.svg" badge="1" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_scope.svg" size="1.8vw" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_barrel.svg" size="1.8vw" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_underbarrel.svg" size="1.8vw" /></div>
                </div>
                <HazardSep thin />
                <div className="flex gap-[0.16vw]" style={{ height: '5.93vh' }}>
                  <div className="flex-[2]"><EquipSlot icon="icon_common_secondary_weapon.svg" badge="2" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_scope.svg" size="1.8vw" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_barrel.svg" size="1.8vw" /></div>
                  <div className="flex-1"><EquipSlot icon="icon_common_weapon_attachment_underbarrel.svg" size="1.8vw" /></div>
                </div>
                <HazardSep thin />
                <EquipSlot icon="icon_common_sidearm.svg" badge="3" />
              </>
            ) : (
              <>
                <EquipSlot icon="icon_inventory_handheld.svg" />
                <HazardSep />
                <EquipSlot icon="icon_common_gadgets.svg" badge="4" />
                <HazardSep thin />
                <EquipSlot icon="icon_common_knife.svg" />
                <HazardSep thin />
                <EquipSlot icon="icon_common_miningGadget.svg" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Order and icons from actual game data: Inv_filter_Icons_*.svg
const FILTERS = [
  { key: 'Armor', icon: 'Inv_filter_Icons_armor.svg', label: 'Armor',
    subs: ['All', 'Undersuits', 'Helmets', 'Core', 'Arms', 'Legs', 'Backpacks'] },
  { key: 'Clothing', icon: 'Inv_filter_Icons_clothing.svg', label: 'Clothing',
    subs: ['All', 'Headwear', 'Shirts', 'Jackets', 'Gloves', 'Legwear', 'Footwear', 'Eyewear'] },
  { key: 'Weapons', icon: 'Inv_filter_Icons_weapons.svg', label: 'Weapons',
    subs: ['All', 'Sidearms', 'Primary', 'Special', 'Melee', 'Attachments', 'Throwables'] },
  { key: 'Utility', icon: 'Inv_filter_Icons_utilities.svg', label: 'Utility',
    subs: ['All', 'Gadgets', 'Attachments', 'Medical', 'Cryptokeys', 'Technology'] },
  { key: 'Ammo', icon: 'Inv_filter_Icons_ammo.svg', label: 'Ammo' },
  { key: 'Consumables', icon: 'Inv_filter_Icons_commodities.svg', label: 'Consumables' },
  { key: 'Sustenance', icon: 'Inv_filter_Icons_sustenance.svg', label: 'Sustenance' },
  { key: 'Container', icon: 'Inv_filter_Icons_container.svg', label: 'Container',
    subs: ['All', 'Commodity Cargo', 'Loot Crate'] },
  { key: 'Other', icon: 'Inv_filter_Icons_other.svg', label: 'Other' },
  { key: 'Missions', icon: 'icon_destination.svg', label: 'Missions' },
]

function GearBrowser() {
  const { data, loading } = useFpsGear()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [activeSub, setActiveSub] = useState('All')
  const [showSubs, setShowSubs] = useState(false)

  const activeFilterDef = FILTERS.find(f => f.key === activeCategory)

  const items = useMemo(() => {
    if (!data?.items) return []
    let list = data.items

    // Filter by category
    if (activeCategory) {
      list = list.filter(item => item.category === activeCategory)
      // Sub-category filter
      if (activeSub !== 'All') {
        list = list.filter(item => item.sub_category === activeSub)
      }
    }

    // Search
    if (search.trim()) {
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
      list = list.filter(item => {
        const haystack = `${item.name} ${item.manufacturer_name || ''} ${item.sub_type || ''}`.toLowerCase()
        return tokens.every(t => haystack.includes(t))
      })
    }

    return list
  }, [data, search, activeCategory, activeSub])

  return (
    <div className="flex flex-col h-full" style={{ padding: '0.93vh 0.73vw' }}>
      <div className="text-[0.72vw] tracking-[0.16vw] uppercase mb-1">
        GEAR<span className="mx-1" style={{ color: 'rgba(192,246,254,0.3)' }}>/</span><span style={{ color: '#00e8ff' }}>BROWSE</span>
        {data?.items && <span className="ml-2" style={{ color: 'rgba(192,246,254,0.3)', fontSize: '0.5vw' }}>{items.length}</span>}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-1 mb-1">
        <Ico src="icon_common_menu_search.svg" size="0.94vw" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH..."
          className="flex-1 outline-none"
          style={{
            height: '2.2vh',
            border: '1px solid rgba(0,232,255,0.15)',
            background: 'rgba(0,12,20,0.4)',
            color: '#c0f6fe',
            fontSize: '0.47vw',
            letterSpacing: '0.08vw',
            textTransform: 'uppercase',
            padding: '0 0.4vw',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Filter row */}
      <div className="relative my-[0.37vh]">
        <div className="flex items-center gap-[0.1vw]">
          {FILTERS.map(f => (
            <div
              key={f.key}
              className="flex items-center justify-center cursor-pointer"
              title={f.label}
              onClick={() => {
                if (activeCategory === f.key) {
                  // Click same category: toggle sub-filter dropdown or deselect
                  if (f.subs) {
                    setShowSubs(prev => !prev)
                  } else {
                    setActiveCategory(null)
                    setActiveSub('All')
                    setShowSubs(false)
                  }
                } else {
                  setActiveCategory(f.key)
                  setActiveSub('All')
                  setShowSubs(!!f.subs)
                }
              }}
              style={{
                width: '2vw', height: '2vw',
                border: `1px solid ${activeCategory === f.key ? '#00e8ff' : 'rgba(0,200,230,0.25)'}`,
                background: activeCategory === f.key ? 'rgba(0,232,255,0.12)' : 'rgba(0,12,20,0.4)',
              }}
            >
              <Ico src={f.icon} size="1.2vw" active={activeCategory === f.key} muted={activeCategory !== null && activeCategory !== f.key} />
            </div>
          ))}
          {(activeCategory || search) && (
            <span
              className="ml-auto cursor-pointer"
              onClick={() => { setActiveCategory(null); setActiveSub('All'); setShowSubs(false); setSearch('') }}
              style={{ fontSize: '0.38vw', letterSpacing: '0.05vw', textTransform: 'uppercase', color: 'rgba(192,246,254,0.4)' }}
            >CLEAR</span>
          )}
        </div>

        {/* Sub-filter dropdown */}
        {showSubs && activeFilterDef?.subs && (
          <div
            className="absolute left-0 right-0 z-20 mt-0.5 flex flex-col"
            style={{
              background: 'rgba(0,8,14,0.95)',
              border: '1px solid rgba(0,232,255,0.2)',
            }}
          >
            <div className="px-2 py-1" style={{ fontSize: '0.5vw', letterSpacing: '0.12vw', textTransform: 'uppercase', color: '#00e8ff', borderBottom: '1px solid rgba(0,232,255,0.1)' }}>
              {activeFilterDef.label}
            </div>
            {activeFilterDef.subs.map(sub => (
              <div
                key={sub}
                className="flex items-center gap-1 px-2 cursor-pointer"
                onClick={() => { setActiveSub(sub); setShowSubs(false) }}
                style={{
                  padding: '0.3vh 0.4vw',
                  fontSize: '0.44vw',
                  color: activeSub === sub ? '#00e8ff' : 'rgba(192,246,254,0.6)',
                  background: activeSub === sub ? 'rgba(0,232,255,0.06)' : 'transparent',
                }}
                onMouseEnter={e => { if (activeSub !== sub) e.currentTarget.style.background = 'rgba(0,232,255,0.03)' }}
                onMouseLeave={e => { if (activeSub !== sub) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: '0.5vw', height: '0.5vw',
                  border: `1px solid ${activeSub === sub ? '#00e8ff' : 'rgba(192,246,254,0.3)'}`,
                  background: activeSub === sub ? '#00e8ff' : 'transparent',
                  display: 'inline-block', flexShrink: 0,
                }} />
                {sub === 'All' ? 'All Categories' : sub}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gear list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'rgba(192,246,254,0.25)', fontSize: '0.57vw', letterSpacing: '0.16vw', textTransform: 'uppercase' }}>
            LOADING...
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'rgba(192,246,254,0.25)', fontSize: '0.57vw', letterSpacing: '0.16vw', textTransform: 'uppercase' }}>
            NO ITEMS FOUND
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map((item, i) => (
              <div
                key={`${item.source_table}-${item.id}-${i}`}
                className="flex items-center gap-2 cursor-pointer"
                style={{
                  padding: '0.28vh 0.3vw',
                  borderBottom: '1px solid rgba(0,200,230,0.06)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,232,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '0.52vw', color: '#c0f6fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.42vw', color: 'rgba(192,246,254,0.4)' }}>
                    {item.manufacturer_name || item.sub_type || item.slot}
                  </div>
                </div>
                {item.rarity && item.rarity !== 'Common' && (
                  <span style={{
                    fontSize: '0.36vw',
                    letterSpacing: '0.05vw',
                    textTransform: 'uppercase',
                    color: item.rarity === 'Rare' ? '#4da6ff' : item.rarity === 'Legendary' ? '#ffa500' : 'rgba(192,246,254,0.35)',
                    flexShrink: 0,
                  }}>{item.rarity}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FpsLoadout() {
  const [equipTab, setEquipTab] = useState('weapons')

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 'calc(100vh - 3rem)',
        color: '#c0f6fe',
        fontFamily: 'sans-serif',
      }}
    >
      {/* F288: page-level heading for screen readers (the visual UI uses styled spans). */}
      <h1 className="sr-only">FPS Loadout — Preview</h1>
      <div className="absolute inset-0">
        <div className="relative w-full h-full">

          {/* Panel frame backgrounds — each covers its half, edge to edge */}
          <div
            className="absolute top-0 left-0 h-full pointer-events-none"
            style={{
              width: '50%',
              background: `url(${ICON('inventory_panel_composite.png')}) left top / 100% 100% no-repeat`,
            }}
          />
          <div
            className="absolute top-0 right-0 h-full pointer-events-none"
            style={{
              width: '50%',
              background: `url(${ICON('inventory_panel_composite.png')}) left top / 100% 100% no-repeat`,
              transform: 'scaleX(-1)',
            }}
          />

          {/* Separators */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '26.46%', top: '50%', transform: 'translateY(-50%)',
              width: '3.333%', height: '68.519%',
              background: `url(${ICON('inventory_bg_separator.png')}) center / 100% 100% no-repeat`,
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              right: '26.46%', top: '50%', transform: 'translateY(-50%) scaleX(-1)',
              width: '3.333%', height: '68.519%',
              background: `url(${ICON('inventory_bg_separator.png')}) center / 100% 100% no-repeat`,
            }}
          />

          {/* Left panel — Equipment */}
          <div
            className="absolute left-0 flex flex-col z-10"
            style={{ top: '6.25%', width: '26.5625%', height: '87.5%' }}
          >
            <EquipmentPanel equipTab={equipTab} setEquipTab={setEquipTab} />
          </div>

          {/* Center — Weapon Bench */}
          <div
            className="absolute z-[5]"
            style={{ left: '26.5625%', right: '26.5625%', top: 0, height: '100%' }}
          >
            <div className="h-full overflow-y-auto p-4"><WeaponBenchContainer /></div>
          </div>

          {/* Right panel — Gear Browser */}
          <div
            className="absolute right-0 flex flex-col z-10"
            style={{ top: '6.25%', width: '26.5625%', height: '87.5%' }}
          >
            <GearBrowser />
          </div>

        </div>
      </div>
    </div>
  )
}
