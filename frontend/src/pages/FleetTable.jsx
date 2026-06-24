import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useFleet, useFleetLoaners, useUserOrgs, updateShipVisibility, bulkSetVisibility, deleteIngameShip, clearIngameShips } from '../hooks/useAPI'
import { ArrowUpDown, SearchX, Rocket, Upload, Wrench, ChevronDown, Filter, Check, KeyRound, Plus, Trash2, Coins } from 'lucide-react'
import AddIngameShipModal from './AddIngameShipModal'
import AlertBanner from '../components/AlertBanner'
import PageHeader from '../components/PageHeader'
import PrivacyMask from '../components/PrivacyMask'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import FilterSelect from '../components/FilterSelect'
import SearchInput from '../components/SearchInput'
import InsuranceBadge from '../components/InsuranceBadge'
import StatusBadge from '../components/StatusBadge'
import ShipImage from '../components/ShipImage'
import CommunityTools from '../components/CommunityTools'
import ShareFleetBanner from '../components/ShareFleetBanner'
import FleetTagCell from './FleetTagCell'
import { getRoleGroup } from '../lib/roleGroups'

/** Get display value and numeric sort value for a fleet entry's cost.
 * Prefers current_value_cents (from upgrade chain / pledge data) over raw pledge_cost string. */
function getShipValue(entry) {
  // Prefer current_value_cents from pledge/upgrade data
  if (entry.current_value_cents != null && entry.current_value_cents > 0) {
    const dollars = entry.current_value_cents / 100
    return { display: `$${Math.round(dollars).toLocaleString('en-US')}`, numeric: dollars }
  }
  // Fall back to parsing pledge_cost string
  return parsePledgeCost(entry.pledge_cost)
}

/** Parse pledge_cost string (e.g. "$290.00", "$0.00 USD", "¤15,000 UEC") into a display value and numeric sort value. */
function parsePledgeCost(raw) {
  if (!raw) return { display: '-', numeric: 0 }
  const str = raw.trim()
  if (str.includes('¤') || str.toUpperCase().includes('UEC')) return { display: '-', numeric: 0 }
  const match = str.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (!match) return { display: '-', numeric: 0 }
  const num = parseFloat(match[1].replace(/,/g, ''))
  if (!num || num === 0) return { display: '-', numeric: 0 }
  const formatted = `$${Math.round(num).toLocaleString('en-US')}`
  return { display: formatted, numeric: num }
}

/** Get MSRP display from the vehicles table pledge_price. Value is stored in
 * whole USD (e.g. Origin 100i = 50), not cents — the earlier /100 divisor
 * displayed Gladius as $1 and Javelin as $30 (F217/F231). */
function getMsrp(entry) {
  if (entry.pledge_price != null && entry.pledge_price > 0) {
    const dollars = entry.pledge_price
    return { display: `$${Math.round(dollars).toLocaleString('en-US')}`, numeric: dollars }
  }
  return { display: '-', numeric: 0 }
}

/** Count how many ships share the same pledge_id in the fleet. */
function buildPackCounts(fleet) {
  const counts = new Map()
  for (const entry of fleet) {
    if (!entry.pledge_id) continue
    counts.set(entry.pledge_id, (counts.get(entry.pledge_id) || 0) + 1)
  }
  return counts
}

/** Clean pledge name for display — strip "Standalone Ship(s) - ", "Package - " etc. */
function cleanPledgeName(name) {
  if (!name) return null
  return name
    .replace(/^Standalone\s+Ships?\s*-\s*/i, '')
    .replace(/^Package\s*-\s*/i, '')
    .replace(/^Add-Ons\s*-\s*/i, '')
    .replace(/^Combo\s*-\s*/i, '')
    .replace(/^Upgrade\s*-\s*/i, 'CCU: ')
    .trim()
}

/** Bucket a row into a fleet category. Owned ships split by production status
 * (in_production folds into Concept — both are "unreleased / owned"); derived
 * loaner rows are their own category. */
export function rowCategory(v) {
  if (v.is_derived_loaner) return 'loaner'
  if (v.source === 'ingame') return 'ingame'
  if (v.production_status === 'flight_ready') return 'flight_ready'
  return 'concept'
}

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'flight_ready', label: 'Flight Ready' },
  { key: 'concept', label: 'Concept' },
  { key: 'loaner', label: 'Loaners' },
  { key: 'ingame', label: 'In-Game' },
]

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'org', label: 'Org' },
  { value: 'officers', label: 'Officers' },
  { value: 'public', label: 'Public' },
]

// "Set all" header dropdown — same options as the per-row select but the
// onPick fires a bulk update instead of changing a single row. Rendered in
// the Visibility column header.
function BulkVisibilityHeader({ onPick, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block ml-2 normal-case">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="text-[10px] tracking-wide text-gray-500 hover:text-sc-accent flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Set visibility on every ship in your fleet"
      >
        Set all
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-32 rounded-lg bg-gray-800/95 backdrop-blur-md border border-white/[0.1] shadow-xl shadow-black/40 overflow-hidden">
          {VISIBILITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onPick(opt.value) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function VisibilitySelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = VISIBILITY_OPTIONS.find(o => o.value === value) || VISIBILITY_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all cursor-pointer ${
          open
            ? 'bg-white/[0.08] border border-sc-accent/40 text-gray-200'
            : 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:border-white/[0.15] hover:text-gray-300'
        }`}
      >
        {selected.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-28 rounded-lg bg-gray-800/95 backdrop-blur-md border border-white/[0.1] shadow-xl shadow-black/40 overflow-hidden">
          {VISIBILITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? 'bg-sc-accent/10 text-sc-accent'
                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FleetTable() {
  const { data: fleet, loading, error, refetch } = useFleet()
  const { data: loaners } = useFleetLoaners()
  const { data: orgsData } = useUserOrgs()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const sortKey = searchParams.get('sort') || 'vehicle_name'
  const sortDir = searchParams.get('dir') || 'asc'
  const filter = searchParams.get('filter') || ''
  const sizeFilter = searchParams.get('size') || 'all'
  const categoryFilter = searchParams.get('category') || 'all'
  const tagFilter = searchParams.get('tag') || 'all'

  // Owned ships + derived loaner ships, in one list for the unified view.
  const combined = useMemo(
    () => [...(fleet || []), ...(loaners || [])],
    [fleet, loaners],
  )

  const categoryCounts = useMemo(() => {
    const counts = { all: 0, flight_ready: 0, concept: 0, loaner: 0, ingame: 0 }
    for (const v of combined) { counts.all++; counts[rowCategory(v)]++ }
    return counts
  }, [combined])

  const inOrgs = !!(orgsData?.orgs?.length > 0)

  // Distinct tags across the fleet, for the tag filter (#120). Loaners are
  // derived rows without a user_fleet id, so tags only come from owned ships.
  const allTags = useMemo(() => {
    if (!fleet) return []
    const s = new Set()
    for (const v of fleet) for (const t of v.tags || []) s.add(t)
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [fleet])

  // In-game-purchased ships (manually added; cleared after a wipe).
  const [showAddIngame, setShowAddIngame] = useState(false)
  const [ingameBusy, setIngameBusy] = useState(false)
  const ingameCount = categoryCounts.ingame || 0

  async function handleDeleteIngame(id) {
    if (ingameBusy) return
    setIngameBusy(true)
    try { await deleteIngameShip(id); refetch() } catch { /* surfaced by row state */ } finally { setIngameBusy(false) }
  }

  async function handleClearIngame() {
    if (ingameBusy || ingameCount === 0) return
    if (!window.confirm(`Remove all ${ingameCount} in-game-purchased ship${ingameCount === 1 ? '' : 's'} from your fleet? (Pledged ships are unaffected.)`)) return
    setIngameBusy(true)
    try { await clearIngameShips(); refetch() } catch { /* no-op */ } finally { setIngameBusy(false) }
  }

  // Bulk-visibility undo state. Holds the previous (id → org_visibility) snapshot
  // for 5s so the user can revert a "Set all" they didn't mean. The timerId is
  // tracked so a second "Set all" cancels any pending dismiss.
  const [bulkUndo, setBulkUndo] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  async function handleBulkVisibility(value) {
    if (!fleet || fleet.length === 0 || bulkBusy) return
    const snapshot = fleet.map((s) => ({ id: s.id, org_visibility: s.org_visibility || 'private' }))
    setBulkBusy(true)
    try {
      await bulkSetVisibility({ mode: 'all', org_visibility: value })
      await refetch()
      if (bulkUndo?.timerId) clearTimeout(bulkUndo.timerId)
      const timerId = setTimeout(() => setBulkUndo(null), 5000)
      setBulkUndo({ applied: value, count: snapshot.length, snapshot, timerId })
    } catch (err) {
      console.error('[fleet] bulk visibility failed', err)
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkUndo() {
    if (!bulkUndo || bulkBusy) return
    clearTimeout(bulkUndo.timerId)
    setBulkBusy(true)
    try {
      await bulkSetVisibility({ mode: 'entries', entries: bulkUndo.snapshot })
      await refetch()
    } catch (err) {
      console.error('[fleet] bulk undo failed', err)
    } finally {
      setBulkBusy(false)
      setBulkUndo(null)
    }
  }

  useEffect(() => () => { if (bulkUndo?.timerId) clearTimeout(bulkUndo.timerId) }, [bulkUndo])

  const packFilter = searchParams.get('pack') || 'all'

  const sizes = useMemo(() => {
    const s = new Set(combined.map((v) => v.size_label || 'Unknown'))
    return ['all', ...Array.from(s).sort()]
  }, [combined])

  const packCounts = useMemo(() => fleet ? buildPackCounts(fleet) : new Map(), [fleet])

  const packs = useMemo(() => {
    if (!fleet) return []
    const seen = new Map()
    for (const v of fleet) {
      if (!v.pledge_id || seen.has(v.pledge_id)) continue
      const count = packCounts.get(v.pledge_id) || 1
      if (count > 1) {
        seen.set(v.pledge_id, cleanPledgeName(v.pledge_name) || `Pack #${v.pledge_id}`)
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [fleet, packCounts])

  const sorted = useMemo(() => {
    if (!fleet) return []
    let items = [...combined]

    if (categoryFilter !== 'all') {
      items = items.filter((v) => rowCategory(v) === categoryFilter)
    }

    if (filter) {
      const f = filter.toLowerCase()
      items = items.filter(
        (v) =>
          v.vehicle_name?.toLowerCase().includes(f) ||
          v.custom_name?.toLowerCase().includes(f) ||
          v.manufacturer_name?.toLowerCase().includes(f) ||
          v.focus?.toLowerCase().includes(f) ||
          v.pledge_name?.toLowerCase().includes(f)
      )
    }

    if (sizeFilter !== 'all') {
      items = items.filter((v) => (v.size_label || 'Unknown') === sizeFilter)
    }

    if (packFilter !== 'all') {
      items = items.filter((v) => v.pledge_id === packFilter)
    }

    if (tagFilter !== 'all') {
      items = items.filter((v) => (v.tags || []).includes(tagFilter))
    }

    items.sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'vehicle_name': va = a.vehicle_name; vb = b.vehicle_name; break
        case 'size': va = a.size_label || ''; vb = b.size_label || ''; break
        case 'focus': va = a.focus || ''; vb = b.focus || ''; break
        case 'pledge': va = getShipValue(a).numeric; vb = getShipValue(b).numeric; break
        case 'msrp': va = getMsrp(a).numeric; vb = getMsrp(b).numeric; break
        case 'pack': va = a.pledge_name || ''; vb = b.pledge_name || ''; break
        case 'status': va = (a.production_status || '').toLowerCase(); vb = (b.production_status || '').toLowerCase(); break
        case 'insurance': va = a.insurance_type || ''; vb = b.insurance_type || ''; break
        default: va = a.vehicle_name; vb = b.vehicle_name
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return items
  }, [fleet, combined, categoryFilter, filter, sizeFilter, packFilter, tagFilter, sortKey, sortDir])

  const toggleSort = (key) => {
    setSearchParams(prev => {
      // Always set `sort` explicitly so ?dir=desc alone on the URL is never
      // ambiguous. Fixes F238 — Ship column click used to update `dir` only
      // because the default sort key matched, breaking URL fidelity for deep
      // links shared in that state.
      prev.set('sort', key)
      if (sortKey === key) {
        prev.set('dir', sortDir === 'asc' ? 'desc' : 'asc')
      } else {
        prev.set('dir', 'asc')
      }
      return prev
    }, { replace: true })
  }

  const clearFilters = () => {
    setSearchParams(prev => {
      prev.delete('filter')
      prev.delete('size')
      prev.delete('pack')
      prev.delete('category')
      prev.delete('tag')
      return prev
    }, { replace: true })
  }

  if (loading) return <LoadingState message="Loading fleet..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="MY FLEET"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddIngame(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-sc-accent/15 hover:bg-sc-accent/25 text-sc-accent border border-sc-accent/30 rounded transition-colors cursor-pointer"
              title="Add a ship you bought in-game with aUEC"
            >
              <Coins className="w-3.5 h-3.5" /> Add In-Game Ship
            </button>
            {ingameCount > 0 && (
              <button
                onClick={handleClearIngame}
                disabled={ingameBusy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white/[0.04] hover:bg-red-500/10 text-gray-400 hover:text-red-300 border border-white/[0.08] hover:border-red-500/30 rounded transition-colors cursor-pointer disabled:opacity-50"
                title="Remove all in-game-purchased ships (e.g. after a server wipe)"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear In-Game ({ingameCount})
              </button>
            )}
            <span className="text-xs font-mono text-gray-500">{sorted.length} ships</span>
          </div>
        }
      />

      {showAddIngame && (
        <AddIngameShipModal onClose={() => setShowAddIngame(false)} onAdded={refetch} />
      )}

      <ShareFleetBanner />

      {bulkUndo && (
        <AlertBanner variant="success" icon={Check}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              Set <strong className="text-white">{bulkUndo.count}</strong>{' '}
              {bulkUndo.count === 1 ? 'ship' : 'ships'} to{' '}
              <strong className="text-white">
                {VISIBILITY_OPTIONS.find((o) => o.value === bulkUndo.applied)?.label || bulkUndo.applied}
              </strong>
            </span>
            <button
              type="button"
              onClick={handleBulkUndo}
              disabled={bulkBusy}
              className="px-3 py-1 rounded border border-sc-border hover:border-sc-accent/40 hover:bg-sc-accent/10 transition-colors text-xs text-gray-300 disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </AlertBanner>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSearchParams(prev => { key === 'all' ? prev.delete('category') : prev.set('category', key); return prev }, { replace: true })}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center gap-1.5 ${
              categoryFilter === key
                ? 'bg-sc-accent/15 border-sc-accent/40 text-sc-accent'
                : 'bg-white/[0.04] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'
            }`}
          >
            {key === 'loaner' && <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />}
            {label}
            <span className="text-[10px] font-mono opacity-70">{categoryCounts[key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <SearchInput
          value={filter}
          onChange={(val) => setSearchParams(prev => { val ? prev.set('filter', val) : prev.delete('filter'); return prev }, { replace: true })}
          placeholder="Search ships..."
          className="flex-1 max-w-sm"
        />
        {sizes.length > 1 && (
          <FilterSelect
            value={sizeFilter}
            onChange={(e) => setSearchParams(prev => { e.target.value === 'all' ? prev.delete('size') : prev.set('size', e.target.value); return prev }, { replace: true })}
            options={sizes}
            allLabel="All Sizes"
          />
        )}
        {packs.length > 0 && (
          <select
            value={packFilter}
            onChange={(e) => setSearchParams(prev => { e.target.value === 'all' ? prev.delete('pack') : prev.set('pack', e.target.value); return prev }, { replace: true })}
            className="px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-gray-300 focus:border-sc-accent/40 cursor-pointer"
          >
            <option value="all">All Packs</option>
            {packs.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        {packFilter !== 'all' && (
          <button
            onClick={() => setSearchParams(prev => { prev.delete('pack'); return prev }, { replace: true })}
            className="text-xs text-gray-500 hover:text-sc-accent transition-colors"
          >
            Clear pack filter
          </button>
        )}
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setSearchParams(prev => { e.target.value === 'all' ? prev.delete('tag') : prev.set('tag', e.target.value); return prev }, { replace: true })}
            className="px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-gray-300 focus:border-sc-accent/40 cursor-pointer"
          >
            <option value="all">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Your fleet ships — click a row to view ship details</caption>
            <thead>
              <tr className="bg-sc-darker/50">
                {[
                  { key: 'vehicle_name', label: 'Ship' },
                  { key: 'size', label: 'Size' },
                  { key: 'focus', label: 'Role' },
                  { key: 'pack', label: 'Pack / Pledge' },
                  { key: 'pledge', label: 'Pledge Value' },
                  { key: 'msrp', label: 'MSRP' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    scope="col"
                    className="table-header cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
                    onClick={() => toggleSort(key)}
                    aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === key ? 'text-sc-accent' : 'text-gray-500'}`} aria-hidden="true" />
                    </span>
                  </th>
                ))}
                {[
                  { key: 'status', label: 'Status' },
                  { key: 'insurance', label: 'Insurance' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    scope="col"
                    className="table-header cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
                    onClick={() => toggleSort(key)}
                    aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === key ? 'text-sc-accent' : 'text-gray-500'}`} aria-hidden="true" />
                    </span>
                  </th>
                ))}
                <th scope="col" className="table-header">
                  Visibility
                  <BulkVisibilityHeader onPick={handleBulkVisibility} disabled={bulkBusy || !fleet?.length} />
                </th>
                {inOrgs && <th scope="col" className="table-header">Ops</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={inOrgs ? 10 : 9} className="py-12">
                    {fleet && fleet.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <Rocket className="w-10 h-10 text-gray-500" />
                        <p className="text-gray-400 text-sm">Your fleet is empty</p>
                        <p className="text-gray-500 text-xs max-w-sm">Sync your hangar to start tracking your ships, insurance, and pledges.</p>
                        <a href="/sync-import" className="btn-primary text-xs inline-flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" /> Sync & Import
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <SearchX className="w-10 h-10 text-gray-500" />
                        <p className="text-gray-500 text-sm">No ships match your filters</p>
                        <button onClick={clearFilters} className="btn-secondary text-xs">
                          Clear Filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                sorted.map((v, i) => {
                  const isLoaner = !!v.is_derived_loaner
                  const isIngame = v.source === 'ingame'
                  const rowKey = isLoaner ? `loaner-${v.vehicle_id}` : (v.id || `row-${i}`)
                  return (
                  <tr
                    key={rowKey}
                    className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                    onClick={() => navigate(`/ships/${v.vehicle_slug}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/ships/${v.vehicle_slug}`); } }}
                    tabIndex={0}
                    role="row"
                    aria-label={`View details for ${v.vehicle_name}${v.custom_name ? ` "${v.custom_name}"` : ''}`}
                  >
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <ShipImage
                          src={v.paint_image_url_medium || v.paint_image_url || v.image_url}
                          alt={v.vehicle_name}
                          aspectRatio="thumbnail-lg"
                          className="rounded border border-sc-border/50 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{v.vehicle_name}</span>
                            {isLoaner && (
                              <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded">
                                <KeyRound className="w-3 h-3" aria-hidden="true" /> Loaner
                              </span>
                            )}
                            {isIngame && (
                              <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded">
                                <Coins className="w-3 h-3" aria-hidden="true" /> In-Game
                              </span>
                            )}
                          </div>
                          {isLoaner
                            ? v.loaner_for && (
                                <span className="block text-xs text-gray-500">
                                  loaner for {String(v.loaner_for).split(',').join(', ')}
                                </span>
                              )
                            : v.custom_name && (
                                <span className="block text-xs text-sc-accent italic">"{v.custom_name}"</span>
                              )}
                          {/* Tags are stored per user_fleet row; loaners are derived and have no id. */}
                          {!isLoaner && (
                            <FleetTagCell
                              fleetId={v.id}
                              tags={v.tags || []}
                              onUpdated={refetch}
                              onFilterTag={(tag) => setSearchParams(prev => { prev.set('tag', tag); return prev }, { replace: true })}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <span className="w-6 flex-shrink-0 flex justify-center">
                          {v.production_status === 'flight_ready' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(isLoaner
                                  ? `/loadout/${v.vehicle_slug}?loaner_vehicle_id=${v.vehicle_id}`
                                  : `/loadout/${v.vehicle_slug}?fleet_id=${v.id}`)
                              }}
                              className="p-1 text-zinc-600 hover:text-sky-400 transition-colors"
                              title="Customize loadout"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                        {isIngame && (
                          <span className="w-6 flex-shrink-0 flex justify-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteIngame(v.id) }}
                              disabled={ingameBusy}
                              className="p-1 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                              title="Remove this in-game ship"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        )}
                        <span className="badge badge-size inline-block w-16 text-center">{v.size_label || '?'}</span>
                      </div>
                    </td>
                    <td className="table-cell text-gray-400">{getRoleGroup(v.focus, v.classification) || '-'}</td>
                    <td className="table-cell">
                      {(() => {
                        const count = v.pledge_id ? (packCounts.get(v.pledge_id) || 1) : 1
                        const name = cleanPledgeName(v.pledge_name)
                        // F500: the pack cell used to be a large button — clicking anywhere in
                        // the pack name area filtered by pack instead of navigating to the ship
                        // detail (the intended row-level behavior per the row's aria-label).
                        // Now the pack name is plain text (falls through to the row onClick),
                        // and a dedicated filter-icon button handles pack filtering.
                        if (count > 1 && name) {
                          return (
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="block text-xs text-sc-accent2 truncate max-w-[180px]">{name}</span>
                                <span className="text-[10px] text-gray-600">{count} ships</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSearchParams(prev => { prev.set('pack', v.pledge_id); return prev }) }}
                                className="text-gray-500 hover:text-sc-accent transition-colors shrink-0 p-1"
                                title={`Filter fleet to this pack (${count} ships)`}
                                aria-label={`Filter fleet to the ${name} pack`}
                              >
                                <Filter className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        }
                        return <span className="text-xs text-gray-600">{name || '-'}</span>
                      })()}
                    </td>
                    <td className="table-cell font-mono text-gray-400">
                      {(() => {
                        const count = v.pledge_id ? (packCounts.get(v.pledge_id) || 1) : 1
                        const val = getShipValue(v)
                        if (count > 1 && val.numeric > 0) {
                          return (
                            <PrivacyMask placeholder="$•••" value={val.numeric}>
                              <span className="text-gray-500" title={`${val.display} pack total shared across ${count} ships`}>
                                {val.display}
                                <span className="text-[10px] text-gray-600 ml-1">({count}-ship&nbsp;pack)</span>
                              </span>
                            </PrivacyMask>
                          )
                        }
                        return <PrivacyMask placeholder="$•••" value={val.numeric}>{val.display}</PrivacyMask>
                      })()}
                    </td>
                    <td className="table-cell font-mono text-gray-400">
                      <PrivacyMask placeholder="$•••" value={getMsrp(v).numeric}>{getMsrp(v).display}</PrivacyMask>
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={v.production_status} size="sm" />
                    </td>
                    <td className="table-cell">
                      <InsuranceBadge isLifetime={v.is_lifetime} label={v.insurance_label} />
                    </td>
                    <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                      {isLoaner ? (
                        <span className="text-xs text-gray-600">—</span>
                      ) : (
                        <VisibilitySelect
                          value={v.org_visibility || 'private'}
                          onChange={async (val) => {
                            await updateShipVisibility(v.id, { org_visibility: val }).catch(() => {})
                            refetch()
                          }}
                        />
                      )}
                    </td>
                    {inOrgs && (
                      <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                        {!isLoaner && (
                          <input
                            type="checkbox"
                            checked={!!v.available_for_ops}
                            onChange={async (e) => {
                              await updateShipVisibility(v.id, { available_for_ops: e.target.checked }).catch(() => {})
                              refetch()
                            }}
                            title="Available for ops"
                            className="w-4 h-4 accent-sc-accent cursor-pointer rounded"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CommunityTools />
    </div>
  )
}
