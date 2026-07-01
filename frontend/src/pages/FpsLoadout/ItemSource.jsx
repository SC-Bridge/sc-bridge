// frontend/src/pages/FpsLoadout/ItemSource.jsx
import React, { useMemo, useState } from 'react'

// Palette lifted from the FPS loadout visual system (see MyLoadout.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE = '#c0f6fe'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const OWN = '#36e08a'
const WANT = '#f3b03a'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'

const WEAPON_SLOTS = new Set(['primary', 'secondary', 'sidearm'])
const ARMOUR_SLOTS = new Set(['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit'])
const UTILITY_SLOTS = new Set(['medical', 'gadget', 'throwable'])

const TYPES = ['Weapons', 'Armour', 'Attach', 'Utility']

// Lenient sub_type matching — catalog sub_type spelling varies (e.g. 'rifle', 'assault_rifle').
const WEAPON_CATEGORIES = [
  { label: 'Rifles', match: ['rifle'] },
  { label: 'SMG', match: ['smg', 'submachine'] },
  { label: 'Shotgun', match: ['shotgun'] },
  { label: 'Sniper', match: ['sniper'] },
  { label: 'LMG', match: ['lmg', 'machine gun', 'machinegun'] },
  { label: 'Pistol', match: ['pistol'] },
]

function defaultTypeForSlot(slotKey) {
  if (ARMOUR_SLOTS.has(slotKey)) return 'Armour'
  if (UTILITY_SLOTS.has(slotKey)) return 'Utility'
  return 'Weapons' // weapon slots, and anything unrecognised, default to Weapons
}

function itemKey(item) {
  return item?.uuid || item?.name
}

function matchesCategory(subType, category) {
  const s = (subType || '').toLowerCase()
  return category.match.some((m) => s.includes(m))
}

// Average of a build's per-slot craft qualities, for the "CUSTOM Qnnn" tag.
function buildQuality(config) {
  const qualities = config?.qualities
  if (!qualities) return 500
  const vals = Object.values(qualities).map(Number).filter((n) => !Number.isNaN(n))
  if (!vals.length) return 500
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function ownershipState(ownership, key) {
  if (!key) return null
  if (ownership?.owned?.has(key)) return 'owned'
  if (ownership?.wishlisted?.has(key)) return 'wishlisted'
  return null
}

// A saved build is never confirmed as owned outright — you may own the base weapon
// without having crafted this exact quality/attachment combo — so it reads as
// aspirational whenever the base weapon is owned or wishlisted.
function buildOwnershipState(ownership, weaponUuid) {
  return ownershipState(ownership, weaponUuid) ? 'wishlisted' : null
}

function OwnBadge({ state }) {
  if (state === 'owned') {
    return (
      <span className="font-bold flex-none" style={{ fontSize: 13, color: OWN }} aria-label="owned" title="Owned">
        &#10003;
      </span>
    )
  }
  if (state === 'wishlisted') {
    return (
      <span className="font-bold flex-none" style={{ fontSize: 13, color: WANT }} aria-label="aspirational" title="Aspirational">
        &#9671;
      </span>
    )
  }
  return null
}

function Row({ testId, custom, ctag, name, sub, state, onClick }) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-2.5 py-2 px-2 cursor-pointer"
      style={{
        borderBottom: `1px solid ${LINE}`,
        borderLeft: custom ? `2px solid ${WANT}` : '2px solid transparent',
        background: custom ? 'rgba(243,176,58,0.04)' : 'transparent',
      }}
    >
      <div className="flex-none rounded-sm" style={{ width: 30, height: 22, border: `1px solid ${LINE2}` }} />
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: 12, color: '#eafcff' }}>
          {name}
          {ctag && (
            <span
              className="ml-1.5 align-middle rounded-sm"
              style={{ fontSize: 8, letterSpacing: '0.8px', padding: '1px 5px', border: '1px solid rgba(243,176,58,0.5)', color: WANT }}
            >
              {ctag}
            </span>
          )}
        </div>
        {sub && (
          <div className="uppercase truncate" style={{ fontSize: 9.5, color: ICE_DIM }}>
            {sub}
          </div>
        )}
      </div>
      <OwnBadge state={state} />
    </div>
  )
}

function EmptyRow({ children }) {
  return (
    <div className="italic text-center py-6" style={{ fontSize: 11, color: ICE_DIM }}>
      {children}
    </div>
  )
}

export default function ItemSource({ slotKey, weapons = [], attachments = [], builds = [], ownership = {}, onPick }) {
  const [type, setType] = useState(() => defaultTypeForSlot(slotKey))
  const [category, setCategory] = useState(WEAPON_CATEGORIES[0].label)
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const activeCategory = WEAPON_CATEGORIES.find((c) => c.label === category) || WEAPON_CATEGORIES[0]

  const filteredWeapons = useMemo(
    () => weapons.filter((w) => (!q || w.name?.toLowerCase().includes(q)) && matchesCategory(w.sub_type, activeCategory)),
    [weapons, activeCategory, q],
  )

  const filteredBuilds = useMemo(
    () => builds.filter((b) => !q || b.name?.toLowerCase().includes(q)),
    [builds, q],
  )

  const filteredAttachments = useMemo(
    () => attachments.filter((a) => !q || a.name?.toLowerCase().includes(q)),
    [attachments, q],
  )

  const pick = (item) => onPick?.(item)

  return (
    <div>
      <div
        className="flex items-center gap-2 mb-2 rounded"
        style={{ border: `1px solid ${LINE}`, padding: '7px 9px', color: ICE_DIM }}
      >
        <span aria-hidden="true">&#128269;</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          data-testid="item-source-search"
          className="flex-1 bg-transparent outline-none border-0"
          style={{ fontSize: 12, color: ICE }}
        />
      </div>

      <div className="flex gap-1.5 mb-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`type-${t.toLowerCase()}`}
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className="flex-1 text-center uppercase rounded"
            style={{
              fontSize: 10.5,
              padding: '6px 4px',
              letterSpacing: '0.6px',
              border: `1px solid ${type === t ? CYAN : LINE}`,
              color: type === t ? CYAN : ICE_DIM,
              background: type === t ? 'rgba(0,232,255,0.12)' : 'transparent',
              fontWeight: type === t ? 600 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {type === 'Weapons' && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {WEAPON_CATEGORIES.map((c) => (
              <button
                key={c.label}
                type="button"
                data-testid={`cat-${c.label.toLowerCase()}`}
                aria-pressed={category === c.label}
                onClick={() => setCategory(c.label)}
                className="rounded"
                style={{
                  fontSize: 10,
                  padding: '4px 8px',
                  border: `1px solid ${category === c.label ? CYAN_DIM : LINE}`,
                  color: category === c.label ? ICE : ICE_DIM,
                  background: category === c.label ? 'rgba(0,232,255,0.06)' : 'transparent',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div>
            {filteredBuilds.map((b) => (
              <Row
                key={`build-${b.id}`}
                testId={`item-build-${b.id}`}
                custom
                ctag={`◇ CUSTOM Q${buildQuality(b.config)}`}
                name={b.name}
                sub="your design"
                state={buildOwnershipState(ownership, b.weapon_uuid)}
                onClick={() => pick(b)}
              />
            ))}
            {filteredWeapons.map((w) => (
              <Row
                key={itemKey(w)}
                testId={`item-weapon-${itemKey(w)}`}
                name={w.name}
                sub={w.manufacturer_name}
                state={ownershipState(ownership, itemKey(w))}
                onClick={() => pick(w)}
              />
            ))}
            {filteredWeapons.length === 0 && filteredBuilds.length === 0 && <EmptyRow>No weapons match.</EmptyRow>}
          </div>
        </>
      )}

      {type === 'Attach' && (
        <div>
          {filteredAttachments.map((a) => (
            <Row
              key={itemKey(a)}
              testId={`item-attach-${itemKey(a)}`}
              name={a.name}
              sub={a.sub_type || a.manufacturer_name}
              state={ownershipState(ownership, itemKey(a))}
              onClick={() => pick(a)}
            />
          ))}
          {filteredAttachments.length === 0 && <EmptyRow>No attachments match.</EmptyRow>}
        </div>
      )}

      {(type === 'Armour' || type === 'Utility') && <EmptyRow>{type} catalog coming soon.</EmptyRow>}
    </div>
  )
}
