// frontend/src/pages/FpsLoadout/ItemSource.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { isCompatible, SLOT_LABEL } from './attachmentCompat'
import { SLOT_FAMILY } from './portCapacity'

// Palette lifted from the FPS loadout visual system (see MyLoadout.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE = '#c0f6fe'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const OWN = '#36e08a'
const WANT = '#f3b03a'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'

const ARMOUR_SLOTS = new Set(['helmet', 'core', 'arms', 'legs', 'backpack', 'undersuit'])

const TYPES = ['Weapons', 'Armour', 'Attach', 'Utility']

// Lenient sub_type matching — catalog sub_type spelling varies (e.g. 'rifle', 'assault_rifle').
// 'All' (match: null) is first and is the default so search isn't ANDed against a narrow
// sub-filter by default — users searching "FS" shouldn't have to know FS-9 is an LMG first.
const WEAPON_CATEGORIES = [
  { label: 'All', match: null },
  { label: 'Rifles', match: ['rifle'] },
  { label: 'SMG', match: ['smg', 'submachine'] },
  { label: 'Shotgun', match: ['shotgun'] },
  { label: 'Sniper', match: ['sniper'] },
  { label: 'LMG', match: ['lmg', 'machine gun', 'machinegun'] },
  { label: 'Pistol', match: ['pistol'] },
]

// Attach tab sub-filters — keyed on the attachment's mapped bench slot.
// 'Magazines' is a slice-3 addition: magazines are a separate catalog (the
// `magazines` prop), not part of `attachments`, so it's handled as its own
// filtered list rather than through the a.slot === category.slot match below.
const ATTACH_CATEGORIES = [
  { label: 'All', slot: null },
  { label: 'Optics', slot: 'optic' },
  { label: 'Barrels', slot: 'barrel' },
  { label: 'Underbarrel', slot: 'underbarrel' },
  { label: 'Magazines', slot: 'magazines' },
]

// Utility tab sub-filters — keyed on util_slot from /gamedata/utility-items.
// 'Tool Attach.' rows (util_slot null) are multi-tool attachments: browsable
// + badged, but they don't equip into a paperdoll slot themselves. 'Knife' is
// a slice-3 addition: knives are a separate catalog (the `knives` prop) so
// they equip as { kind: 'melee' } rather than { kind: 'utility' }.
const UTILITY_CATEGORIES = [
  { label: 'All', match: undefined },
  { label: 'Medical', match: 'medical' },
  { label: 'Gadgets', match: 'gadget' },
  { label: 'Throwable', match: 'throwable' },
  { label: 'Knife', match: 'knife' },
  { label: 'Tool Attach.', match: null },
]

const UTIL_SLOT_LABEL = { medical: 'Medical', gadget: 'Gadget', throwable: 'Throwable', knife: 'Knife' }

// Armour tab sub-filters — slot first (matches the paperdoll), then weight class.
const ARMOUR_SLOT_CATEGORIES = [
  { label: 'All', slot: null },
  { label: 'Helmet', slot: 'helmet' },
  { label: 'Core', slot: 'core' },
  { label: 'Arms', slot: 'arms' },
  { label: 'Legs', slot: 'legs' },
  { label: 'Undersuit', slot: 'undersuit' },
  { label: 'Backpack', slot: 'backpack' },
]
const ARMOUR_WEIGHT_CATEGORIES = [
  { label: 'Any', match: null },
  { label: 'Light', match: 'light' },
  { label: 'Medium', match: 'medium' },
  { label: 'Heavy', match: 'heavy' },
]

// Dynamic ordinal families (grenade_N/pen_N/util_gadget/util_knife -> Utility;
// mag_N -> Attach) route to a different TYPE tab than the fixed slots; sling_N
// stays on Weapons (it holds a real weapon, just via the sling family).
const UTIL_TAB_FAMILIES = new Set(['grenades', 'pens', 'utilGadget', 'utilKnife'])

function defaultTypeForSlot(slotKey) {
  if (ARMOUR_SLOTS.has(slotKey)) return 'Armour'
  const { family } = SLOT_FAMILY(slotKey)
  if (family === 'mags') return 'Attach'
  if (UTIL_TAB_FAMILIES.has(family)) return 'Utility'
  return 'Weapons' // weapon slots, sling slots, and anything unrecognised, default to Weapons
}

// Shared sub-filter pill strip (Weapons / Attach / Utility tabs).
function CategoryPills({ categories, active, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2.5">
      {categories.map((c) => (
        <button
          key={c.label}
          type="button"
          data-testid={`cat-${c.label.toLowerCase().replace(/[^a-z]+/g, '')}`}
          aria-pressed={active === c.label}
          onClick={() => onSelect(c.label)}
          className="rounded"
          style={{
            fontSize: 10,
            padding: '4px 8px',
            border: `1px solid ${active === c.label ? CYAN_DIM : LINE}`,
            color: active === c.label ? ICE : ICE_DIM,
            background: active === c.label ? 'rgba(0,232,255,0.06)' : 'transparent',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

function itemKey(item) {
  return item?.uuid || item?.name
}

// The blueprint's display name from useCrafting is the raw internal name
// (e.g. "Behr Lmg Ballistic 01"); the friendly, player-facing name lives at
// base_stats.item_name (e.g. "FS-9 LMG"). Fall back to the raw name only
// when a friendly name hasn't been extracted yet.
function friendlyWeaponName(weapon) {
  return weapon?.base_stats?.item_name || weapon?.name
}

function matchesCategory(subType, category) {
  if (!category.match) return true // 'All'
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

function Row({ testId, custom, ctag, name, sub, state, onClick, dragId, dragData }) {
  // dnd-kit drag source. The PointerSensor's 4px activation distance keeps
  // plain clicks working (onClick still fires when no drag starts).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dragId ?? `row-${testId}`,
    data: dragData,
    disabled: !dragData,
  })
  return (
    <div
      ref={setNodeRef}
      {...(dragData ? listeners : {})}
      {...(dragData ? attributes : {})}
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-2.5 py-2 px-2 cursor-pointer touch-none"
      style={{
        borderBottom: `1px solid ${LINE}`,
        borderLeft: custom ? `2px solid ${WANT}` : '2px solid transparent',
        background: custom ? 'rgba(243,176,58,0.04)' : 'transparent',
        opacity: isDragging ? 0.35 : 1,
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

export default function ItemSource({ slotKey, weapon = null, weapons = [], attachments = [], builds = [], utility = [], knives = [], magazines = [], armours = [], armourBuilds = [], ownership = {}, onPick }) {
  const [type, setType] = useState(() => defaultTypeForSlot(slotKey))
  const [category, setCategory] = useState(WEAPON_CATEGORIES[0].label)
  const [attachCategory, setAttachCategory] = useState(ATTACH_CATEGORIES[0].label)
  const [utilCategory, setUtilCategory] = useState(UTILITY_CATEGORIES[0].label)
  const [armourSlotCat, setArmourSlotCat] = useState(ARMOUR_SLOT_CATEGORIES[0].label)
  const [armourWeightCat, setArmourWeightCat] = useState(ARMOUR_WEIGHT_CATEGORIES[0].label)
  const [search, setSearch] = useState('')

  // The container no longer remounts this component on slot change (search
  // text and pill selections must survive a slot jump), so the active TYPE
  // tab follows the slotKey prop itself instead of a fresh useState default.
  // The matching sub-filter pill follows along too — selecting the Helmet
  // slot should land on the Helmet pill within Armour, not "All" — for
  // armour and utility slots (weapon slots only change the TYPE tab; the
  // weapon category pill is left alone). Slice 3's dynamic ordinal families
  // route through SLOT_FAMILY rather than a direct slotKey match (the old
  // fixed slot keys — medical/gadget/throwable — WERE their own util_slot
  // value; grenade_2/pen_3/mag_5/etc. are not, so they resolve via family).
  useEffect(() => {
    setType(defaultTypeForSlot(slotKey))
    const armourSlot = ARMOUR_SLOT_CATEGORIES.find((c) => c.slot === slotKey)
    if (armourSlot) setArmourSlotCat(armourSlot.label)
    const { family } = SLOT_FAMILY(slotKey)
    if (family === 'grenades') setUtilCategory('Throwable')
    else if (family === 'pens') setUtilCategory('Medical')
    else if (slotKey === 'util_gadget') setUtilCategory('Gadgets')
    else if (slotKey === 'util_knife') setUtilCategory('Knife')
    else if (family === 'mags') setAttachCategory('Magazines')
  }, [slotKey])

  const q = search.trim().toLowerCase()
  const activeCategory = WEAPON_CATEGORIES.find((c) => c.label === category) || WEAPON_CATEGORIES[0]
  const activeAttachCategory = ATTACH_CATEGORIES.find((c) => c.label === attachCategory) || ATTACH_CATEGORIES[0]
  const activeUtilCategory = UTILITY_CATEGORIES.find((c) => c.label === utilCategory) || UTILITY_CATEGORIES[0]
  const activeArmourSlot = ARMOUR_SLOT_CATEGORIES.find((c) => c.label === armourSlotCat) || ARMOUR_SLOT_CATEGORIES[0]
  const activeArmourWeight = ARMOUR_WEIGHT_CATEGORIES.find((c) => c.label === armourWeightCat) || ARMOUR_WEIGHT_CATEGORIES[0]

  const filteredWeapons = useMemo(
    () => weapons.filter((w) => (!q || friendlyWeaponName(w)?.toLowerCase().includes(q)) && matchesCategory(w.sub_type, activeCategory)),
    [weapons, activeCategory, q],
  )

  // Match a design by either its own name or its weapon's friendly name — a
  // user searching "FS" should find a design saved on the FS-9 even if they
  // named the design something else (e.g. "my sim").
  const filteredBuilds = useMemo(
    () => builds.filter((b) => !q || b.name?.toLowerCase().includes(q) || b.weaponName?.toLowerCase().includes(q)),
    [builds, q],
  )

  // Only show attachments the weapon on the bench can actually take (by port
  // type/size/tags). Without a weapon selected, isCompatible is permissive so
  // the full list still shows.
  const filteredAttachments = useMemo(
    () => attachments.filter((a) =>
      (!q || a.name?.toLowerCase().includes(q))
      && (activeAttachCategory.slot == null || a.slot === activeAttachCategory.slot)
      && isCompatible(weapon, a)),
    [attachments, weapon, q, activeAttachCategory],
  )

  const filteredUtility = useMemo(
    () => utility.filter((u) =>
      (!q || u.name?.toLowerCase().includes(q))
      // 'All' (match undefined) shows everything; 'Tool Attach.' matches null util_slot.
      && (activeUtilCategory.match === undefined || (u.util_slot ?? null) === activeUtilCategory.match)),
    [utility, q, activeUtilCategory],
  )

  // Knives are a separate catalog (not mixed into `utility`) because they
  // equip as { kind: 'melee' }, not { kind: 'utility' } — shown under "All"
  // and under their own "Knife" pill, hidden under every other pill.
  const filteredKnives = useMemo(
    () => knives.filter((k) =>
      (!q || k.name?.toLowerCase().includes(q))
      && (activeUtilCategory.match === undefined || activeUtilCategory.match === 'knife')),
    [knives, q, activeUtilCategory],
  )

  // Magazines are a separate catalog (not mixed into `attachments`) because
  // they equip as { kind: 'magazine' }, not { kind: 'attachment' } — shown
  // under "All" and under their own "Magazines" pill, hidden under every other pill.
  const filteredMagazines = useMemo(
    () => magazines.filter((m) =>
      (!q || m.name?.toLowerCase().includes(q))
      && (activeAttachCategory.slot == null || activeAttachCategory.slot === 'magazines')),
    [magazines, q, activeAttachCategory],
  )

  const filteredArmours = useMemo(
    () => armours.filter((a) =>
      (!q || friendlyWeaponName(a)?.toLowerCase().includes(q))
      && (activeArmourSlot.slot == null || a.base_stats?.armour_slot === activeArmourSlot.slot)
      && (activeArmourWeight.match == null || (a.base_stats?.armour_weight || '').toLowerCase() === activeArmourWeight.match)),
    [armours, q, activeArmourSlot, activeArmourWeight],
  )
  const filteredArmourBuilds = useMemo(
    () => armourBuilds.filter((b) => !q || b.name?.toLowerCase().includes(q) || b.itemName?.toLowerCase().includes(q)),
    [armourBuilds, q],
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
          <CategoryPills categories={WEAPON_CATEGORIES} active={category} onSelect={setCategory} />

          <div>
            {filteredBuilds.map((b) => (
              <Row
                key={`build-${b.id}`}
                testId={`item-build-${b.id}`}
                custom
                ctag={`◇ CUSTOM Q${buildQuality(b.config)}`}
                name={b.name}
                sub={b.weaponName ? `${b.weaponName} · your design` : 'your design'}
                state={buildOwnershipState(ownership, b.item_uuid || b.weaponUuid)}
                onClick={() => pick(b)}
                dragId={`build-${b.id}`}
                dragData={{ kind: 'build', build: b }}
              />
            ))}
            {filteredWeapons.map((w) => (
              <Row
                key={itemKey(w)}
                testId={`item-weapon-${itemKey(w)}`}
                name={friendlyWeaponName(w)}
                sub={w.manufacturer_name}
                state={ownershipState(ownership, itemKey(w))}
                onClick={() => pick(w)}
                dragId={`weapon-${itemKey(w)}`}
                dragData={{ kind: 'weapon', weapon: w }}
              />
            ))}
            {filteredWeapons.length === 0 && filteredBuilds.length === 0 && <EmptyRow>No weapons match.</EmptyRow>}
          </div>
        </>
      )}

      {type === 'Attach' && (
        <div>
          <CategoryPills categories={ATTACH_CATEGORIES} active={attachCategory} onSelect={setAttachCategory} />
          {filteredAttachments.map((a) => (
            <Row
              key={itemKey(a)}
              testId={`item-attach-${itemKey(a)}`}
              name={a.name}
              sub={SLOT_LABEL[a.slot] || a.sub_type || a.manufacturer_name}
              state={ownershipState(ownership, itemKey(a))}
              onClick={() => pick(a)}
              dragId={`attach-${itemKey(a)}`}
              dragData={{ kind: 'attachment', attachment: a }}
            />
          ))}
          {filteredMagazines.map((m) => (
            <Row
              key={itemKey(m)}
              testId={`item-magazine-${itemKey(m)}`}
              name={m.name}
              sub={[m.fits_class ? `Fits ${m.fits_class}` : null, m.magazine_capacity ? `${m.magazine_capacity} rd` : null].filter(Boolean).join(' · ')}
              state={ownershipState(ownership, itemKey(m))}
              onClick={() => pick(m)}
              dragId={`magazine-${itemKey(m)}`}
              dragData={{ kind: 'magazine', magazine: m }}
            />
          ))}
          {filteredAttachments.length === 0 && filteredMagazines.length === 0 && <EmptyRow>No attachments match.</EmptyRow>}
        </div>
      )}

      {type === 'Utility' && (
        <div>
          <CategoryPills categories={UTILITY_CATEGORIES} active={utilCategory} onSelect={setUtilCategory} />
          {filteredUtility.map((u) => (
            <Row
              key={itemKey(u)}
              testId={`item-utility-${itemKey(u)}`}
              name={u.name}
              sub={u.util_slot ? `${UTIL_SLOT_LABEL[u.util_slot]} · ${u.manufacturer_name || u.sub_type}` : `Multi-Tool attachment · ${u.manufacturer_name || ''}`}
              state={ownershipState(ownership, itemKey(u))}
              onClick={() => pick(u)}
              dragId={`utility-${itemKey(u)}`}
              // Tool attachments (util_slot null) are browsable but have no
              // paperdoll slot to drop into, so they aren't drag sources.
              dragData={u.util_slot ? { kind: 'utility', item: u } : null}
            />
          ))}
          {filteredKnives.map((k) => (
            <Row
              key={itemKey(k)}
              testId={`item-knife-${itemKey(k)}`}
              name={k.name}
              sub={`Knife · ${k.manufacturer_name || k.sub_type || ''}`}
              state={ownershipState(ownership, itemKey(k))}
              onClick={() => pick(k)}
              dragId={`knife-${itemKey(k)}`}
              dragData={{ kind: 'melee', item: k }}
            />
          ))}
          {filteredUtility.length === 0 && filteredKnives.length === 0 && <EmptyRow>No utility items match.</EmptyRow>}
        </div>
      )}

      {type === 'Armour' && (
        <div>
          <CategoryPills categories={ARMOUR_SLOT_CATEGORIES} active={armourSlotCat} onSelect={setArmourSlotCat} />
          <CategoryPills categories={ARMOUR_WEIGHT_CATEGORIES} active={armourWeightCat} onSelect={setArmourWeightCat} />
          {filteredArmourBuilds.map((b) => (
            <Row key={`abuild-${b.id}`} testId={`item-armour-build-${b.id}`} custom
              ctag={`◇ CUSTOM Q${buildQuality(b.config)}`} name={b.name}
              sub={b.itemName ? `${b.itemName} · your design` : 'your design'}
              state={buildOwnershipState(ownership, b.item_uuid)}
              onClick={() => pick(b)} dragId={`abuild-${b.id}`} dragData={{ kind: 'build', build: b }} />
          ))}
          {filteredArmours.map((a) => (
            <Row key={itemKey(a)} testId={`item-armour-${itemKey(a)}`}
              name={friendlyWeaponName(a)}
              sub={[a.base_stats?.armour_slot, a.base_stats?.armour_weight].filter(Boolean).join(' · ')}
              state={ownershipState(ownership, itemKey(a))}
              onClick={() => pick(a)} dragId={`armour-${itemKey(a)}`}
              dragData={{ kind: 'armour', armour: a }} />
          ))}
          {filteredArmours.length === 0 && filteredArmourBuilds.length === 0 && <EmptyRow>No armour matches.</EmptyRow>}
        </div>
      )}
    </div>
  )
}
