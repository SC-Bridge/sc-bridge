import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Package, Users, Crosshair, Shield, Coins, AlertTriangle, FileText, Star, MapPin, FlaskConical, Building2, Clock, Lock, Ban, Trophy, TrendingUp, TrendingDown, Minus, Gem, Wrench, Search, Radio, Layers, List } from 'lucide-react'
import { useContracts, useAPI, useMissionGivers } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'
import StatCard from '../components/StatCard'
import { FACTION_LOGOS, getFactionLogo, GUILD_LABELS, cleanMissionDescription, humanizeFactionSlug, humanizeScopeSlug, humanizeStandingSlug, humanizeComparison, formatRepRequirement, formatRepSize, humanizeMissionStem, humanizeMissionGiverSlug, sentenceCaseTitle, deriveRepScopeSlugs } from '../lib/missionConstants'
import { MissionTitle } from '../components/MissionTitle'
import { RepCostBadges } from '../components/RepCostBadges'

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap ${
        active
          ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
          : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── Source / type badges ────────────────────────────────────────────────────

const SOURCE_BADGE = {
  contract:       { label: 'Contract', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  mission_board:  { label: 'Board', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  service_beacon: { label: 'Beacon', style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  dynamic:        { label: 'Dynamic', style: 'bg-white/[0.04] text-gray-500 border-white/[0.06]' },
}

const CATEGORY_LABELS = {
  Bounty: 'Bounty', Cargo: 'Cargo', Cave: 'Cave', Collection: 'Collection',
  Defense: 'Defense', Delivery: 'Delivery', General: 'General', Investigation: 'Investigation',
  Mercenary: 'Mercenary', Mining: 'Mining', Prison: 'Prison', Retrieval: 'Retrieval',
  Salvage: 'Salvage', 'Search & Rescue': 'Search & Rescue', Support: 'Support',
  'Combat Gauntlet': 'Combat Gauntlet', 'Navy Patrol Training': 'Navy Patrol',
  'Small Items': 'Collection', 'Standard': 'Collection', 'Favours': 'Favours',
  'Vehicle Delivery': 'Delivery', 'Waste Disposal': 'Collection',
  'Synced Assassination': 'Bounty', Events: 'Events', 'Combined Ops': 'Combined',
  Recovery: 'Recovery', Theft: 'Theft', Tutorial: 'Tutorial', Exploration: 'Exploration',
  // CIG raw category values returned by /api/gamedata/missions.category
  // ("missiontype.delivery" etc. come from p4k mission-type filename stems).
  'missiontype.delivery': 'Delivery', 'missiontype.job': 'Job',
  'missiontype.search': 'Search & Rescue', 'missiontype.salvage': 'Salvage',
  'missiontype.repair': 'Repair', 'missiontype.combat': 'Combat',
  'missiontype.transport': 'Transport', 'missiontype.escort': 'Escort',
  servicebeacon: 'Service Beacon', bountyhunter: 'Bounty Hunter',
  mercenary: 'Mercenary', priority: 'Priority', hauling: 'Hauling',
  maintenance: 'Maintenance', mining: 'Mining', exploration: 'Exploration',
  unknown: 'Other',
}

// Case-insensitive label lookup + title-case fallback. Raw CIG category values
// that aren't in CATEGORY_LABELS, or differ only by case (e.g. "appointment",
// "investigation", "salvage"), would otherwise leak into the dropdown as raw
// lowercase chips. This normalises them and merges case-variant duplicates.
const CATEGORY_LABELS_LC = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([k, v]) => [k.toLowerCase(), v]),
)
function categoryLabel(raw) {
  if (!raw) return raw
  return CATEGORY_LABELS_LC[String(raw).toLowerCase()]
    || String(raw).replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())
}

// Per-category leading icon + colour — gives each row a visual anchor (echoing
// the faction-card logos) and shares the colour vocabulary of the Factions view.
const CATEGORY_ICONS = {
  Delivery: { Icon: Package, color: 'text-sky-400' },
  Hauling: { Icon: Package, color: 'text-sky-400' },
  Cargo: { Icon: Package, color: 'text-sky-400' },
  Collection: { Icon: Package, color: 'text-teal-400' },
  Mercenary: { Icon: Crosshair, color: 'text-red-400' },
  Bounty: { Icon: Crosshair, color: 'text-amber-400' },
  'Bounty Hunter': { Icon: Crosshair, color: 'text-amber-400' },
  'Combat Gauntlet': { Icon: Shield, color: 'text-red-400' },
  'Navy Patrol': { Icon: Shield, color: 'text-sky-400' },
  'Service Beacon': { Icon: Radio, color: 'text-blue-400' },
  Mining: { Icon: Gem, color: 'text-orange-400' },
  Salvage: { Icon: Wrench, color: 'text-zinc-400' },
  Maintenance: { Icon: Wrench, color: 'text-zinc-400' },
  Investigation: { Icon: Search, color: 'text-purple-400' },
  'Search & Rescue': { Icon: Search, color: 'text-emerald-400' },
  Priority: { Icon: Star, color: 'text-amber-400' },
  Favours: { Icon: Users, color: 'text-pink-400' },
  Appointment: { Icon: Clock, color: 'text-gray-400' },
  Job: { Icon: FileText, color: 'text-gray-400' },
}
function CategoryIcon({ category, className = 'w-4 h-4' }) {
  const entry = CATEGORY_ICONS[category] || { Icon: FileText, color: 'text-gray-500' }
  const Icon = entry.Icon
  return <Icon className={`${className} ${entry.color} shrink-0`} aria-hidden="true" />
}

function deriveSystem(locationRef, locality) {
  const val = (locationRef || locality || '').toLowerCase()
  if (val.includes('stanton') || val.startsWith('stanton')) return 'Stanton'
  if (val.includes('pyro') || val.startsWith('pyro')) return 'Pyro'
  if (val.includes('nyx') || val.startsWith('nyx')) return 'Nyx'
  return null
}

function playerCountLabel(maxPlayers) {
  if (maxPlayers == null) return null
  if (maxPlayers === 1) return { label: 'Solo', style: 'bg-sky-500/10 text-sky-400 border-sky-500/20' }
  if (maxPlayers > 50) return { label: 'Server Event', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' }
  if (maxPlayers >= 2) return { label: `Group (${maxPlayers})`, style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
  if (maxPlayers === -1) return { label: 'Unlimited', style: 'bg-gray-500/10 text-gray-400 border-gray-500/20' }
  return null
}

const SYSTEM_BADGE_STYLES = {
  Stanton: 'bg-sc-accent/10 text-sc-accent border-sc-accent/20',
  Nyx: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Pyro: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

function parseRequirements(json) {
  if (!json || json === 'random') return null
  try {
    const reqs = JSON.parse(json)
    return reqs.length > 0 ? reqs : null
  } catch { return null }
}

// ── Expanded section (3-zone layout) ───────────────────────────────────────


function ExpandedSection({ entry, prerequisites, repRequirements, repChanges }) {
  const [descExpanded, setDescExpanded] = useState(false)
  const [prereqsExpanded, setPrereqsExpanded] = useState(false)

  const system = deriveSystem(entry.location_ref, entry.locality)
  const players = playerCountLabel(entry.max_players)
  const source = SOURCE_BADGE[entry.source] || SOURCE_BADGE.dynamic
  const requirements = parseRequirements(entry.requirements_json)

  // Clean description
  const briefingText = cleanMissionDescription(entry.description)
  const DESC_MAX = 280
  const isLongDesc = briefingText.length > DESC_MAX
  const displayDesc = isLongDesc && !descExpanded ? briefingText.slice(0, DESC_MAX) + '...' : briefingText

  // Prerequisites / rep requirements
  const mId = entry.mission_id
  const prereqs = (entry.source !== 'contract' && mId != null) ? prerequisites?.[mId] : null
  const repReqs = (entry.source !== 'contract' && mId != null) ? repRequirements?.[mId] : null
  const hasPrereqs = prereqs?.length > 0
  const hasRepReqs = repReqs?.length > 0
  const hasRepRewards = entry.rep_summary || entry.rep_fail || entry.rep_abandon
  // PART K K11: structured rep changes per (scope, event) from mission_rep_changes.
  const repChangeRows = (entry.source !== 'contract' && mId != null) ? repChanges?.[mId] : null
  const hasCrimeWarnings = entry.fail_if_criminal === 1 || entry.wanted_level_min > 0
  const hasRequirementsSection = hasPrereqs || hasRepReqs || hasRepRewards || hasCrimeWarnings || requirements || entry.source !== 'contract'

  // Reward display
  const reward = entry.reward_amount || 0
  const rewardText = (() => {
    if (entry.reward_text) return entry.reward_text
    if (reward <= 0) return null
    if (entry.reward_max > 0 && entry.reward_max !== reward) {
      return `${reward.toLocaleString()} - ${entry.reward_max.toLocaleString()} aUEC`
    }
    return `${reward.toLocaleString()} aUEC`
  })()

  return (
    <div className="px-4 pb-4 space-y-0">
      {/* ── Zone 1: Mission Intel Bar ────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 border-b border-white/[0.04]">
        {/* Left group: source, category, system — giver + category cross-link
            to the filtered list view (Track A). */}
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.giver_display && (
            <Link
              to={`/missions?giver=${encodeURIComponent(entry.giver_display)}`}
              className="text-[11px] font-mono text-sc-accent hover:text-sc-accent2 transition-colors"
              title={`Show all missions from ${entry.giver_display}`}
            >
              {entry.giver_display}
            </Link>
          )}
          {entry.giver_display && entry.category_display && (
            <span className="text-gray-700 select-none">/</span>
          )}
          {entry.category_display && (
            <Link
              to={`/missions?cat=${encodeURIComponent(entry.category_display)}`}
              className="text-[11px] font-mono text-gray-500 hover:text-gray-300 transition-colors"
              title={`Show all ${entry.category_display} missions`}
            >
              {entry.category_display}
            </Link>
          )}
          {system && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${SYSTEM_BADGE_STYLES[system] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
              <MapPin className="w-3 h-3" />{system}
            </span>
          )}
        </div>

        {/* Center group: time limit, player count, one-time, prison */}
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.time_limit_minutes != null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
              <Clock className="w-3 h-3" />{entry.time_limit_minutes} min
            </span>
          )}
          {players && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${players.style}`}>
              <Users className="w-3 h-3" />{players.label}
            </span>
          )}
          {entry.once_only === 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
              One-time
            </span>
          )}
          {entry.available_in_prison === 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-gray-500/10 text-gray-400 border-gray-500/20">
              <Lock className="w-3 h-3" />Prison
            </span>
          )}
        </div>

        {/* Right group: reward, buy-in */}
        <div className="flex items-center gap-2 ml-auto">
          {entry.buy_in_amount > 0 && (
            <span className="text-[10px] font-mono text-gray-500">
              Buy-in: <span className="text-sc-warn">{entry.buy_in_amount.toLocaleString()}</span>
            </span>
          )}
          {rewardText ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border bg-sc-warn/10 text-sc-warn border-sc-warn/20">
              <Coins className="w-3 h-3" />{rewardText}
              {entry.has_standing_bonus === 1 && <span className="text-emerald-400" title="Standing bonus available">+</span>}
            </span>
          ) : entry.source === 'mission_board' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border bg-white/[0.03] text-gray-500 border-white/[0.06] italic">
              <Coins className="w-3 h-3" />Reward Unknown
            </span>
          ) : null}
          {entry.sequence_num != null && (
            <span className="text-[10px] font-mono text-gray-600">#{entry.sequence_num}</span>
          )}
        </div>
      </div>

      {/* ── Zone 2: Mission Briefing ─────────────────────────── */}
      <div className="py-3">
        {/* Crime warnings — red alert bar */}
        {hasCrimeWarnings && (
          <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-red-500/[0.07] border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
              {entry.fail_if_criminal === 1 && (
                <span className="text-red-400">Fails if CrimStat gained</span>
              )}
              {entry.wanted_level_min > 0 && (
                <span className="text-red-400">Requires CrimStat {entry.wanted_level_min}+</span>
              )}
              {entry.wanted_level_max > 0 && entry.wanted_level_max < 99 && (
                <span className="text-amber-400">Max CrimStat: {entry.wanted_level_max}</span>
              )}
            </div>
          </div>
        )}

        {/* Linked reward (contract-specific) */}
        {(entry.reward_vehicle_slug || entry.reward_item_uuid) && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-sc-accent2/[0.07] border border-sc-accent2/20">
            <Trophy className="w-4 h-4 text-sc-accent2 shrink-0" />
            <span className="text-xs font-mono text-gray-400">Reward:</span>
            {entry.reward_vehicle_slug && (
              <Link to={`/ships/${entry.reward_vehicle_slug}`} className="text-xs font-mono text-sc-accent2 hover:text-sc-accent transition-colors">{entry.reward_text}</Link>
            )}
            {entry.reward_item_uuid && (
              <Link to={`/loot/${entry.reward_item_uuid}`} className="text-xs font-mono text-sc-accent2 hover:text-sc-accent transition-colors">{entry.reward_text}</Link>
            )}
          </div>
        )}

        {/* Description */}
        {briefingText ? (
          <div>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{displayDesc}</p>
            {isLongDesc && (
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                className="text-xs text-sc-accent/70 hover:text-sc-accent mt-1 transition-colors"
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-600 italic">No description available</p>
        )}

        {entry.notes && (
          <p className="text-[11px] font-mono text-amber-400/80 italic mt-2">{entry.notes}</p>
        )}
      </div>

      {/* ── Zone 3: Mission Requirements ─────────────────────── */}
      {hasRequirementsSection && (
        <div className="border-t border-white/[0.04] pt-3 space-y-3">

          {/* Contract requirements (delivery items) */}
          {requirements && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Package className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Delivery Requirements</span>
              </div>
              <ul className="space-y-0.5 pl-1">
                {requirements.map((req, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs font-mono text-gray-300">
                    <span className="text-sc-accent2 min-w-[2ch] text-right">{req.quantity}x</span>
                    <span>{req.item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entry.requirements_json === 'random' && (
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-mono text-gray-500 italic">Requirements randomized each time</span>
            </div>
          )}

          {/* Prerequisites (mission chain) */}
          {hasPrereqs && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400/70" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/70">
                  Prerequisites ({prereqs.length})
                </span>
                {prereqs.length > 3 && (
                  <button
                    onClick={() => setPrereqsExpanded(!prereqsExpanded)}
                    className="text-[10px] text-amber-400/50 hover:text-amber-400 transition-colors ml-1"
                  >
                    {prereqsExpanded ? 'collapse' : 'show all'}
                  </button>
                )}
              </div>
              <ol className="space-y-0.5 pl-1">
                {(prereqs.length <= 3 || prereqsExpanded ? prereqs : prereqs.slice(0, 3)).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-amber-400/50 font-mono min-w-[1.5ch] text-right shrink-0">{i + 1}.</span>
                    <span className="text-gray-300">{p.title}</span>
                  </li>
                ))}
                {prereqs.length > 3 && !prereqsExpanded && (
                  <li className="text-[10px] text-amber-400/40 font-mono pl-5">
                    +{prereqs.length - 3} more
                  </li>
                )}
              </ol>
            </div>
          )}

          {/* Reputation requirements */}
          {hasRepReqs && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Star className="w-3.5 h-3.5 text-blue-400/70" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400/70">Reputation Required</span>
              </div>
              <ul className="space-y-1 pl-1">
                {repReqs.map((r, i) => {
                  const fmt = formatRepRequirement(r)
                  if (!fmt) return null
                  return (
                    <li key={i} className="text-xs text-gray-300">
                      {fmt.label ? (
                        <span className="text-blue-400">{fmt.label}</span>
                      ) : (
                        <>
                          <span className="text-blue-400">{fmt.standing}</span>
                          <span className="text-gray-500"> {fmt.cmp} with </span>
                          <span className="font-medium text-gray-200">{fmt.faction}</span>
                          {fmt.scope && (
                            <span className="text-gray-600 ml-1">({fmt.scope})</span>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Rep rewards table: success / fail / abandon */}
          {hasRepRewards ? (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Reputation Rewards</span>
              </div>
              {/* Unified numeric rep display. Success comes from the single
                  reputation_reward_size (resolved to a number via the CIG size
                  ladder); fail/abandon come from RepCostBadges, which resolves
                  mission_rep_changes.rep_amount (or the ladder as fallback).
                  Replaced the old RepRewardCell grid, which rendered raw size
                  codes like "XXXXS" — meaningless to a player. */}
              <div className="flex flex-col gap-1">
                {entry.rep_summary && (
                  <div className="flex gap-1 items-center flex-wrap">
                    <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider">success:</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          title={`Success reputation reward (${entry.rep_summary})`}>
                      {formatRepSize(entry.rep_summary, 'positive')} rep
                    </span>
                  </div>
                )}
                <RepCostBadges
                  changes={repChangeRows}
                  repFailSummary={entry.rep_fail}
                  repAbandonSummary={entry.rep_abandon}
                />
                {/* Track A: rep scopes cross-link to the filtered list. */}
                {entry.rep_scopes?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">browse:</span>
                    {entry.rep_scopes.map(slug => (
                      <Link
                        key={slug}
                        to={`/missions?rep=${encodeURIComponent(slug)}`}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-sc-accent/[0.07] text-sc-accent border-sc-accent/20 hover:bg-sc-accent/15 transition-colors"
                        title={`Browse all ${humanizeScopeSlug(slug)} reputation missions`}
                      >
                        {humanizeScopeSlug(slug)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Minus className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600">No Reputation Affiliation</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Unified row ─────────────────────────────────────────────────────────────

// Small ascending/descending caret shown next to the active sort column header.
function SortCaret({ dir }) {
  return <span className="ml-1 text-sc-accent">{dir === 'asc' ? '▲' : '▼'}</span>
}

function EntryRow({ entry, repFocus, isHighlighted, highlightRef, prerequisites, repRequirements, repChanges, hideGiver }) {
  const [expanded, setExpanded] = useState(isHighlighted)
  const source = SOURCE_BADGE[entry.source] || SOURCE_BADGE.dynamic
  const reward = entry.reward_amount || 0

  // Rep Required column value. Two sources: numeric tier (min_reputation, used
  // by the Covalex-style ladders) AND the faction-standing gate (rep_requirements,
  // e.g. "Outsider or higher with Vaughn"). Most bounty/mercenary missions have
  // NULL min_reputation but a real standing gate — the expanded view shows it,
  // so the column must too. Prefer the numeric rank when present, else the
  // compact standing ("Outsider+"), else Open/—.
  const repReqList = (entry.source !== 'contract' && entry.mission_id != null) ? repRequirements?.[entry.mission_id] : null
  let repReqCell = null  // { text, title, tone }
  if (entry.min_reputation != null && entry.min_reputation > 0) {
    repReqCell = { text: `Rank ${entry.min_reputation}`, title: `Requires reputation Rank ${entry.min_reputation}`, tone: 'amber' }
  } else if (repReqList && repReqList.length) {
    // Take the first requirement with a humanisable standing.
    for (const r of repReqList) {
      const fmt = formatRepRequirement(r)
      if (!fmt) continue
      const standing = fmt.label ? fmt.label.split(' with ')[0] : fmt.standing
      if (!standing) continue
      const plus = (r.comparison === 'GreaterThanOrEqualTo' || r.comparison === 'GreaterThan') ? '+' : ''
      const faction = fmt.faction || (fmt.label ? fmt.label.split(' with ')[1] : '')
      repReqCell = { text: `${standing}${plus}`, title: `${standing}${plus ? ' or higher' : ''} with ${faction || 'faction'}`, tone: 'amber' }
      break
    }
  } else if (entry.min_reputation === 0) {
    repReqCell = { text: 'Open', title: 'Open to all — no reputation gate', tone: 'gray' }
  }

  // Rep-focus column: when filtering by a scope, show this mission's effect on
  // that scope (the fail/abandon cost). repFocus is a scope slug (e.g. "affinity").
  // 4.8 moved per-scope amounts out of rep_summary into the structured
  // rep_changes rows, so resolve from there.
  let focusedRep = null  // { text, positive }
  if (repFocus && entry.mission_id != null) {
    const rows = (repChanges?.[entry.mission_id] || []).filter(r => r.scope_slug === repFocus)
    const row = rows.find(r => r.event === 'fail') || rows[0]
    if (row) {
      const text = typeof row.rep_amount === 'number'
        ? `${row.rep_amount < 0 ? '−' : '+'}${Math.abs(row.rep_amount).toLocaleString()}`
        : formatRepSize(row.size_code, row.direction)
      focusedRep = { text, positive: row.direction === 'positive' }
    }
  }

  return (
    <div ref={highlightRef} className={`border-b border-sc-border/30 last:border-0 ${isHighlighted ? 'bg-sc-accent/[0.06] ring-1 ring-sc-accent/20 rounded' : ''}`}>
      <button onClick={() => setExpanded(!expanded)} className={`w-full text-left ${hideGiver ? 'pl-11 pr-4' : 'px-4'} py-3 flex items-center gap-3 hover:bg-white/[0.025] transition-colors`}>
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <CategoryIcon category={entry.category_display} />
          <span className="text-sm text-gray-200 truncate" title={entry.category_display || ''}><MissionTitle title={entry.title} /></span>
          {entry.variantCount > 1 && (
            <span className="text-[10px] text-sc-accent font-mono tabular-nums shrink-0" title={`${entry.variantCount} variants across locations — CIG emits one mission per planet/moon`}>
              × {entry.variantCount}
            </span>
          )}
        </div>
        {/* Giver column (hidden in grouped mode — the group header carries it) */}
        {!hideGiver && (
          <span className="w-56 text-xs font-mono text-gray-400 truncate shrink-0 hidden md:block" title={entry.giver_display || ''}>
            {entry.giver_display || <span className="text-gray-700">—</span>}
          </span>
        )}
        {/* Rep Required column */}
        <span className="w-24 text-center text-xs font-mono shrink-0 hidden sm:block truncate">
          {repReqCell ? (
            <span className={repReqCell.tone === 'amber' ? 'text-amber-300/80' : 'text-gray-500'} title={repReqCell.title}>
              {repReqCell.text}
            </span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </span>
        <span className={`w-[4.5rem] text-center text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${source.style}`}>
          {source.label}
        </span>
        {repFocus ? (
          <span className="w-48 text-right text-xs font-mono shrink-0">
            {focusedRep ? (
              <span className={focusedRep.positive ? 'text-emerald-400' : 'text-red-400'}>{focusedRep.text} rep</span>
            ) : <span className="text-gray-700">—</span>}
          </span>
        ) : (
          <span className="w-48 text-right text-xs font-mono shrink-0" title={entry.reward_text || ''}>
            {entry.reward_text ? (
              <span className={entry.reward_vehicle_slug ? 'text-sc-accent2' : entry.reward_currency === 'MG Scrip' ? 'text-blue-300' : 'text-sc-warn'}>
                {entry.reward_text}
              </span>
            ) : reward > 0 ? (
              <>
                <span className="text-sc-warn">
                  {entry.reward_max > 0 && entry.reward_max !== reward
                    ? `${reward.toLocaleString()} - ${entry.reward_max.toLocaleString()}`
                    : reward.toLocaleString()}
                </span>
                {' '}<span className="text-gray-600">aUEC</span>
                {entry.has_standing_bonus === 1 && <span className="text-emerald-400 ml-1" title="Standing bonus available">+</span>}
              </>
            ) : entry.is_dynamic_reward === 1 ? (
              <span className="text-sc-accent2 italic text-[11px]" title="CIG computes the reward at runtime from cargo grade / distance / rep tier">
                Dynamic
              </span>
            ) : entry.source === 'mission_board' ? (
              <span className="text-gray-600 italic text-[10px]">Reward Unknown</span>
            ) : (
              <span className="text-gray-700">—</span>
            )}
          </span>
        )}
        <span className="w-16 text-center shrink-0">
          {entry.is_unlawful && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Unlawful</span>
          )}
        </span>
        <span className="w-5 shrink-0 flex items-center justify-center">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </span>
      </button>
      {expanded && (
        <div className={`animate-fade-in-up ${hideGiver ? 'pl-7' : ''}`}>
          <ExpandedSection entry={entry} prerequisites={prerequisites} repRequirements={repRequirements} repChanges={repChanges} />
        </div>
      )}
    </div>
  )
}

// ── Grouped-view giver header ───────────────────────────────────────────────

function GroupHeader({ group, collapsed, onToggle }) {
  const logo = group.giver ? getFactionLogo(group.giver) : null
  // No logo asset → show an initials monogram (e.g. "Unified Distribution
  // Management" → "UDM") rather than a generic icon. Tidier + distinct per giver.
  const initials = group.giver
    ? group.giver.split(/[\s()]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()
    : null
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.035] hover:bg-white/[0.06] border-b border-sc-border/50 transition-colors"
    >
      {logo ? (
        <img src={logo} alt="" className="w-7 h-7 rounded object-contain shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
          {initials
            ? <span className="text-[10px] font-display font-bold text-gray-400">{initials}</span>
            : <Building2 className="w-3.5 h-3.5 text-gray-500" />}
        </div>
      )}
      <span className="text-sm font-semibold text-gray-200 flex-1 text-left truncate">
        {group.giver || 'Unaffiliated'}
      </span>
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sc-accent/10 text-sc-accent border border-sc-accent/20 shrink-0">
        {group.entries.length}
      </span>
      {collapsed
        ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        : <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />}
    </button>
  )
}

// ── Faction cards (contract generators) ────────────────────────────────────

const SYSTEM_PILL_COLORS = {
  Stanton: 'bg-sc-accent/10 text-sc-accent', Nyx: 'bg-purple-500/10 text-purple-400', Pyro: 'bg-orange-500/10 text-orange-400',
}

function FactionCard({ faction }) {
  const logo = FACTION_LOGOS[faction.name] || FACTION_LOGOS[faction.faction_name]
  const guild = GUILD_LABELS[faction.guild] || ''
  // Always link to faction page by slug
  const factionSlug = faction.faction_slug || faction.name.toLowerCase().replace(/\s+/g, '')
  const linkTo = `/missions/faction/${factionSlug}`
  return (
    <Link
      to={linkTo}
      className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:border-sc-accent/25 hover:bg-white/[0.04] transition-all group flex gap-4"
    >
      {logo ? (
        <img src={logo} alt="" className="w-16 h-16 rounded-lg border border-white/[0.06] object-cover shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-lg border border-white/[0.06] bg-white/[0.03] flex items-center justify-center shrink-0">
          <Shield className="w-6 h-6 text-gray-700" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {guild && <span className="text-[9px] text-gray-600 uppercase tracking-wider">{guild}</span>}
          {faction.mission_types.slice(0, 3).map(t => (
            <span key={t} className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{t}</span>
          ))}
          {faction.mission_types.length > 3 && (
            <span className="text-[9px] text-gray-600">+{faction.mission_types.length - 3} more</span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-white group-hover:text-sc-accent transition-colors truncate">{faction.name}</h3>
        {faction.focus && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{faction.focus}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {faction.systems.map(sys => (
            <span key={sys} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded ${SYSTEM_PILL_COLORS[sys] || 'bg-gray-500/10 text-gray-400'}`}>
              <MapPin className="w-2.5 h-2.5" />{sys}
            </span>
          ))}
          {faction.blueprint_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FlaskConical className="w-2.5 h-2.5" />{faction.blueprint_count} blueprints
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function Missions() {
  const { data: contracts, loading: cLoading, error: cError } = useContracts()
  const { data: missionData, loading: mLoading, error: mError } = useAPI('/gamedata/missions')
  const { data: missionGivers, loading: gLoading } = useMissionGivers()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('q') || ''
  const view = searchParams.get('view') || 'all'
  const sourceFilter = searchParams.get('source') || ''
  const categoryFilter = searchParams.get('cat') || ''
  const typeFilter = searchParams.get('type') || ''
  const giverFilter = searchParams.get('giver') || ''
  const repFilter = searchParams.get('rep') || ''
  const highlightId = searchParams.get('highlight') || ''
  const guildFilter = searchParams.get('guild') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  // Sort: column key + direction. Default name ascending.
  const sortBy = searchParams.get('sort') || 'name'
  const sortDir = searchParams.get('dir') || (sortBy === 'name' ? 'asc' : 'desc')
  // Group the All view by giver (default), echoing the Factions card gallery.
  // ?group=0 falls back to the flat, paginated, globally-sortable table.
  const grouped = searchParams.get('group') !== '0'
  const PAGE_SIZE = 50

  const setParam = useCallback((key, val, replace = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (val) next.set(key, val)
      else next.delete(key)
      // Reset page when changing any filter (but not page itself)
      if (key !== 'page') next.delete('page')
      return next
    }, { replace })
  }, [setSearchParams])
  const setParams = useCallback((updates, replace = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      let hasNonPageChange = false
      for (const [key, val] of Object.entries(updates)) {
        if (val) next.set(key, val)
        else next.delete(key)
        if (key !== 'page') hasNonPageChange = true
      }
      // Reset page when changing any filter
      if (hasNonPageChange && !('page' in updates)) next.delete('page')
      return next
    }, { replace })
  }, [setSearchParams])

  // Sort column click: toggle direction if already active, else switch column
  // with a sensible default direction (name asc, everything else desc).
  const toggleSort = useCallback((col) => {
    if (sortBy === col) {
      setParams({ sort: col, dir: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      setParams({ sort: col, dir: col === 'name' ? 'asc' : 'desc' })
    }
  }, [sortBy, sortDir, setParams])

  // Normalize contracts + missions into one list
  const rawEntries = useMemo(() => {
    const entries = []

    // Contracts → unified shape
    for (const c of (contracts || [])) {
      entries.push({
        id: `c-${c.id}`,
        mission_id: null,
        contract_id: c.id,
        // Contract titles have the same runtime-template issue as missions —
        // humanise so chain contract rows read as "Chain Eliminate All · 1
        // Location · Eliminate Specific" rather than the raw stem.
        title: humanizeMissionStem(c.title),
        description: c.description,
        source: 'contract',
        category: c.category,
        category_display: categoryLabel(c.category),
        giver_display: { wikelo: 'Wikelo', gfs: "Gilly's Flight School", ruto: 'Ruto' }[c.giver_slug] || c.giver_slug,
        giver_slug: c.giver_slug || null,
        reward_amount: c.reward_amount || 0,
        reward_text: c.reward_text || null,
        reward_currency: c.reward_currency,
        reward_vehicle_slug: c.reward_vehicle_slug,
        reward_item_uuid: c.reward_item_uuid,
        is_unlawful: false,
        requirements_json: c.requirements_json,
        sequence_num: c.sequence_num,
        notes: c.notes,
        type_slug: null,
        rep_summary: null,
        rep_scopes: [],
      })
    }

    // Missions → unified shape
    for (const m of (missionData?.missions || [])) {
      entries.push({
        id: `m-${m.id}`,
        mission_id: m.id,
        contract_id: null,
        // Fallback: pipeline can't resolve runtime `~mission(Contractor|…)`
        // templates so some titles are stem-encoded. Humanise so the list
        // reads as "Data Heist · Very Hard · Stanton 1" instead of raw
        // `dataheist_unlawful_vh_stanton1`.
        title: sentenceCaseTitle(humanizeMissionStem(m.title)),
        description: m.description,
        source: m.availability || 'dynamic',
        category: m.category,
        category_display: categoryLabel(m.category),
        giver_display: humanizeMissionGiverSlug(m.giver_name),
        giver_slug: m.giver_slug || null,
        min_reputation: (m.min_reputation ?? null),
        reward_amount: m.reward_amount || 0,
        is_dynamic_reward: m.is_dynamic_reward ?? 0,
        // reward_text is for NON-cash rewards only (items, Merits, MG Scrip).
        // aUEC/UEC are the default currency and render as a plain amount via the
        // reward_amount path — NOT as "{n}x aUEC" (the 'x' quantity form is for
        // item stacks). CIG stores cash as 'aUEC', so check against both spellings.
        reward_text: (m.reward_currency && !['UEC', 'aUEC'].includes(m.reward_currency) && (m.reward_amount || 0) > 0)
          ? `${m.reward_amount}x ${m.reward_currency}`
          : null,
        reward_currency: m.reward_currency || 'aUEC',
        reward_vehicle_slug: null,
        reward_item_uuid: null,
        is_unlawful: !m.is_lawful,
        requirements_json: null,
        sequence_num: null,
        notes: null,
        type_slug: m.type_slug,
        rep_summary: m.rep_summary,
        contract_key: m.contract_key || null,
        // Enriched mission fields
        time_limit_minutes: m.time_limit_minutes ?? null,
        max_players: m.max_players ?? null,
        can_share: m.can_share ?? 0,
        once_only: m.once_only ?? 0,
        fail_if_criminal: m.fail_if_criminal ?? 0,
        available_in_prison: m.available_in_prison ?? 0,
        wanted_level_min: m.wanted_level_min ?? 0,
        wanted_level_max: m.wanted_level_max ?? 0,
        buy_in_amount: m.buy_in_amount ?? 0,
        reward_max: m.reward_max ?? 0,
        has_standing_bonus: m.has_standing_bonus ?? 0,
        location_ref: m.location_ref ?? null,
        locality: m.locality ?? null,
        rep_fail: m.rep_fail ?? null,
        rep_abandon: m.rep_abandon ?? null,
        // Reputation scope slugs this mission affects (Affinity, Security, …),
        // for the Career Reputation browse view + ?rep= filter. 4.8 moved scope
        // out of rep_summary into rep_changes / rep_fail / rep_abandon.
        rep_scopes: deriveRepScopeSlugs(missionData?.rep_changes?.[m.id], m.rep_fail, m.rep_abandon),
        is_template: m.is_template === 1,
      })
    }

    return entries
  }, [contracts, missionData])

  // Template missions (titles/descriptions with unresolved {token} placeholders
  // like {Creature}, {Location}, {ReputationRank}) are CIG mission-instance
  // templates — the game engine fills the tokens per generated instance, so
  // rendering them statically is noise. Hide by default; expose an opt-in toggle.
  // URL-persisted (?templates=1) so the toggle survives reload + deep-links,
  // like every other filter/sort/view control on this page.
  const showTemplates = searchParams.get('templates') === '1'

  // Collapsed giver groups (grouped view). Default: all expanded.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const toggleGroup = useCallback((key) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const filteredEntries = useMemo(
    () => showTemplates ? rawEntries : rawEntries.filter(e => !e.is_template),
    [rawEntries, showTemplates],
  )
  const templateCount = useMemo(
    () => rawEntries.filter(e => e.is_template).length,
    [rawEntries],
  )
  // Group entries with identical title+giver+reward. CIG emits N separate
  // mission rows per planet for the same mission template (e.g. 4 identical
  // "Live and let an independent contractor deal out revenge" rows for
  // Stanton 1-4). Collapse to one row per group with a variant count.
  const allEntries = useMemo(() => {
    const groups = new Map()
    for (const e of filteredEntries) {
      // Group key intentionally EXCLUDES giver. CIG ships N records per logical
      // mission tier (e.g. "get the goods" at minrep=3): one carries the giver
      // ("ruto"), the rest have giver=null. Keying on giver split them into
      // "Ruto ×1" + "(none) ×3". Drop giver from the key and adopt the best
      // non-null giver across the group so they collapse to one "×4 · Ruto" row.
      const key = `${e.title || ''}|${e.reward_amount || 0}|${e.category || ''}|${e.min_reputation ?? ''}`
      const existing = groups.get(key)
      if (existing) {
        existing.variantCount++
        existing.variants.push({ id: e.id, location_ref: e.location_ref, slug: e.slug || e.id })
        // Adopt a giver if this row has one and the group representative didn't.
        if (!existing.giver_display && e.giver_display) existing.giver_display = e.giver_display
        if (!existing.giver_slug && e.giver_slug) existing.giver_slug = e.giver_slug
      } else {
        groups.set(key, { ...e, variantCount: 1, variants: [{ id: e.id, location_ref: e.location_ref, slug: e.slug || e.id }] })
      }
    }
    return Array.from(groups.values())
  }, [filteredEntries])

  // Categories + source counts for filters
  const categories = useMemo(() => {
    const counts = {}
    for (const e of allEntries) counts[e.category] = (counts[e.category] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [allEntries])

  // Group categories by display label to avoid duplicates like "Delivery" appearing twice
  const displayCategories = useMemo(() => {
    const grouped = {}
    for (const [raw, count] of categories) {
      const label = categoryLabel(raw)
      if (!grouped[label]) grouped[label] = { label, rawValues: [], count: 0 }
      grouped[label].rawValues.push(raw)
      grouped[label].count += count
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count)
  }, [categories])

  // Filter
  const filtered = useMemo(() => {
    let items = allEntries
    if (sourceFilter) items = items.filter(e => e.source === sourceFilter)
    if (categoryFilter) {
      // categoryFilter is a display label — find all raw values that map to it
      const matchingGroup = displayCategories.find(dc => dc.label === categoryFilter)
      if (matchingGroup) {
        const rawSet = new Set(matchingGroup.rawValues)
        items = items.filter(e => rawSet.has(e.category))
      } else {
        // Fallback: try direct match on raw category
        items = items.filter(e => e.category === categoryFilter)
      }
    }
    if (typeFilter) items = items.filter(e => e.type_slug === typeFilter || e.type_slug === ('missiontype-' + typeFilter.replace('missiontype-', '')))
    if (giverFilter) items = items.filter(e => e.giver_display === giverFilter)
    if (repFilter) items = items.filter(e => e.rep_scopes && e.rep_scopes.includes(repFilter))
    if (guildFilter) {
      const gf = guildFilter.toLowerCase()
      items = items.filter(e =>
        (e.giver_display && e.giver_display.toLowerCase().includes(gf)) ||
        (e.giver_slug && e.giver_slug.toLowerCase().includes(gf)) ||
        (e.contract_key && e.contract_key.toLowerCase().includes(gf))
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(e =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.giver_display && e.giver_display.toLowerCase().includes(q))
      )
    }
    // Sort by the selected column + direction. Copy first so we don't mutate
    // the memoised allEntries array in place.
    const dir = sortDir === 'asc' ? 1 : -1
    const sorted = [...items]
    sorted.sort((a, b) => {
      let cmp
      switch (sortBy) {
        case 'giver':
          cmp = (a.giver_display || '~').localeCompare(b.giver_display || '~')
          break
        case 'rep':
          // nulls sort last regardless of direction
          cmp = (a.min_reputation ?? 999) - (b.min_reputation ?? 999)
          break
        case 'reward':
          cmp = (a.reward_amount || 0) - (b.reward_amount || 0)
          break
        case 'name':
        default:
          cmp = (a.title || '').localeCompare(b.title || '')
          break
      }
      // Stable tiebreak on title so equal-key rows keep a deterministic order.
      if (cmp === 0 && sortBy !== 'name') cmp = (a.title || '').localeCompare(b.title || '')
      return cmp * dir
    })
    return sorted
  }, [allEntries, displayCategories, sourceFilter, categoryFilter, typeFilter, giverFilter, repFilter, guildFilter, search, sortBy, sortDir])

  // Grouped view: bucket the filtered+sorted list by giver. Group order = entry
  // count desc (biggest first), then name; the "Unaffiliated" bucket (no giver)
  // sorts last. Within-group order is preserved from `filtered` (already sorted).
  const groupedEntries = useMemo(() => {
    const groups = new Map()
    for (const e of filtered) {
      const key = e.giver_display || ' other'
      if (!groups.has(key)) groups.set(key, { key, giver: e.giver_display || null, entries: [] })
      groups.get(key).entries.push(e)
    }
    return [...groups.values()].sort((a, b) => {
      if (!a.giver && b.giver) return 1
      if (a.giver && !b.giver) return -1
      return b.entries.length - a.entries.length || (a.giver || '').localeCompare(b.giver || '')
    })
  }, [filtered])

  const sourceCounts = useMemo(() => {
    const counts = { contract: 0, mission_board: 0, service_beacon: 0, dynamic: 0 }
    for (const e of allEntries) counts[e.source] = (counts[e.source] || 0) + 1
    return counts
  }, [allEntries])

  // Career Reputation tracks: aggregate by real rep SCOPE (Affinity, Security,
  // Assassination, …) from each entry's rep_scopes. Pre-4.8 this parsed
  // rep_summary "scope: amount" pairs; 4.8 made rep_summary a bare magnitude, so
  // scope now comes from rep_changes / rep_fail / rep_abandon (deriveRepScopeSlugs).
  const repScopes = useMemo(() => {
    const scopes = {}
    for (const e of allEntries) {
      for (const slug of (e.rep_scopes || [])) {
        if (!scopes[slug]) scopes[slug] = { slug, name: humanizeScopeSlug(slug), missions: 0 }
        scopes[slug].missions++
      }
    }
    return Object.values(scopes).sort((a, b) => b.missions - a.missions || a.name.localeCompare(b.name))
  }, [allEntries])

  const hasActiveFilter = sourceFilter || categoryFilter || typeFilter || giverFilter || repFilter || guildFilter

  // Highlight: scroll to and auto-expand a specific entry (linked from ArmorSetDetail)
  const highlightRef = useRef(null)
  const highlightScrolled = useRef(false)
  useEffect(() => {
    if (highlightId && highlightRef.current && !highlightScrolled.current) {
      highlightScrolled.current = true
      // Small delay to let DOM settle after render
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [highlightId, filtered])

  const loading = cLoading || mLoading || gLoading
  const error = cError || mError

  if (loading) return <LoadingState message="Loading missions & contracts..." />
  if (error) return <ErrorState message={error} />

  // Stats
  const totalReward = allEntries.reduce((s, e) => s + (e.reward_amount || 0), 0)
  const avgReward = allEntries.length > 0 ? Math.round(totalReward / allEntries.length) : 0
  const unlawfulCount = allEntries.filter(e => e.is_unlawful).length
  const onceOnlyCount = allEntries.filter(e => e.once_only === 1).length

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="MISSIONS & CONTRACTS"
        subtitle={`${allEntries.length} entries from in-game mission board, service beacons, and NPC contracts`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Crosshair} label="Missions" value={sourceCounts.mission_board + sourceCounts.dynamic + sourceCounts.service_beacon} />
        <StatCard icon={FileText} label="Contracts" value={sourceCounts.contract} />
        <StatCard icon={Coins} label="Avg Reward" value={`${avgReward.toLocaleString()} aUEC`} color="text-sc-warn" />
        <StatCard icon={AlertTriangle} label="Unlawful" value={unlawfulCount} color="text-red-400" />
        <StatCard icon={Lock} label="One-time" value={onceOnlyCount} color="text-indigo-400" />
      </div>

      {/* View pills */}
      <div className="flex flex-wrap gap-2">
        <Pill active={view === 'all'} onClick={() => setParam('view', '')}>
          All Missions <span className="opacity-60 ml-1">{allEntries.length}</span>
        </Pill>
        <Pill active={view === 'factions'} onClick={() => setParam('view', 'factions')}>
          <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Factions <span className="opacity-60">{new Set((missionGivers || []).map(g => g.display_name)).size}</span></span>
        </Pill>
        <Pill active={view === 'reputation'} onClick={() => setParam('view', 'reputation')}>
          <span className="flex items-center gap-1.5"><Star className="w-3 h-3" /> Reputation <span className="opacity-60">{repScopes.length}</span></span>
        </Pill>
      </div>

      {/* Filters */}
      {view === 'all' && (
        <div className="flex flex-wrap gap-3 items-start">
          <SearchInput value={search} onChange={v => setParam('q', v, true)} placeholder="Search..." className="max-w-sm flex-1" />
          <button
            type="button"
            onClick={() => setParam('group', grouped ? '0' : '')}
            className={`rounded-lg px-3 py-2 text-xs font-mono border transition-colors inline-flex items-center gap-1.5 ${
              grouped
                ? 'bg-sc-accent/10 border-sc-accent/40 text-sc-accent'
                : 'bg-sc-darker border-sc-border text-gray-400 hover:text-gray-300'
            }`}
            title={grouped ? 'Grouped by giver — switch to a flat, globally-sortable list' : 'Flat list — switch to grouping by giver'}
          >
            {grouped ? <Layers className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
            {grouped ? 'Grouped' : 'Flat'}
          </button>
          {templateCount > 0 && (
            <button
              type="button"
              onClick={() => setParam('templates', showTemplates ? '' : '1')}
              className={`rounded-lg px-3 py-2 text-xs font-mono border transition-colors ${
                showTemplates
                  ? 'bg-sc-accent/10 border-sc-accent/40 text-sc-accent'
                  : 'bg-sc-darker border-sc-border text-gray-400 hover:text-gray-300'
              }`}
              title="Templates are CIG mission instances with unresolved tokens like {Creature}, {ReputationRank} — hidden by default"
            >
              {showTemplates ? '✓ ' : ''}Show {templateCount} templates
            </button>
          )}
          <select value={sourceFilter} onChange={e => setParam('source', e.target.value)} className="bg-sc-darker border border-sc-border rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-sc-accent/40">
            <option value="">All Sources</option>
            <option value="contract">Contracts ({sourceCounts.contract})</option>
            <option value="mission_board">Mission Board ({sourceCounts.mission_board})</option>
            <option value="service_beacon">Service Beacons ({sourceCounts.service_beacon})</option>
            <option value="dynamic">Dynamic ({sourceCounts.dynamic})</option>
          </select>
          <select value={categoryFilter} onChange={e => setParam('cat', e.target.value)} className="bg-sc-darker border border-sc-border rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-sc-accent/40">
            <option value="">All Categories</option>
            {displayCategories.map(dc => (
              <option key={dc.label} value={dc.label}>{dc.label} ({dc.count})</option>
            ))}
          </select>
        </div>
      )}

      {view !== 'all' && (
        <SearchInput value={search} onChange={v => setParam('q', v, true)} placeholder="Search..." className="max-w-sm" />
      )}

      {/* Active filter tags */}
      {hasActiveFilter && view === 'all' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-600">Filtered:</span>
          {sourceFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
              {SOURCE_BADGE[sourceFilter]?.label || sourceFilter}
              <button onClick={() => setParam('source', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          {categoryFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
              {CATEGORY_LABELS[categoryFilter] || categoryFilter}
              <button onClick={() => setParam('cat', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          {typeFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
              {typeFilter}
              <button onClick={() => setParam('type', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          {giverFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
              {giverFilter}
              <button onClick={() => setParam('giver', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          {repFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Star className="w-3 h-3" /> {humanizeScopeSlug(repFilter)}
              <button onClick={() => setParam('rep', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          {guildFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
              Guild: {guildFilter}
              <button onClick={() => setParam('guild', '')} className="hover:text-white ml-1">&times;</button>
            </span>
          )}
          <button onClick={() => setParams({ source: '', cat: '', type: '', giver: '', rep: '', guild: '' })} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear all</button>
        </div>
      )}

      {/* Factions view */}
      {view === 'factions' && (() => {
        // Group generators by display_name into unique factions
        const factionMap = new Map()
        for (const g of (missionGivers || [])) {
          const key = g.display_name || g.generator_key
          if (!factionMap.has(key)) {
            factionMap.set(key, {
              name: g.display_name,
              faction_name: g.faction_name,
              faction_slug: g.faction_slug,
              guild: g.guild,
              focus: g.focus,
              description: g.description,
              mission_types: [],
              systems: new Set(),
              blueprint_count: 0,
              generators: [],
            })
          }
          const f = factionMap.get(key)
          if (g.mission_type && !f.mission_types.includes(g.mission_type)) f.mission_types.push(g.mission_type)
          for (const sys of g.systems.filter(Boolean)) f.systems.add(sys)
          f.blueprint_count += g.blueprint_count || 0
          f.generators.push(g)
        }
        let factions = [...factionMap.values()].map(f => ({ ...f, systems: [...f.systems] }))

        // Search filter
        if (search.trim()) {
          const q = search.toLowerCase()
          factions = factions.filter(f =>
            f.name.toLowerCase().includes(q) ||
            (f.focus || '').toLowerCase().includes(q) ||
            f.mission_types.some(t => t.toLowerCase().includes(q))
          )
        }

        // Sort: with blueprints first, then by name
        factions.sort((a, b) => (b.blueprint_count > 0 ? 1 : 0) - (a.blueprint_count > 0 ? 1 : 0) || a.name.localeCompare(b.name))

        const withBlueprints = factions.filter(f => f.blueprint_count > 0)
        const withoutBlueprints = factions.filter(f => f.blueprint_count === 0)

        return (
          <>
            <div className="space-y-6">
              {withBlueprints.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                    <FlaskConical className="w-3.5 h-3.5" /> With Blueprint Rewards ({withBlueprints.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {withBlueprints.map(f => <FactionCard key={f.name} faction={f} />)}
                  </div>
                </div>
              )}
              {withoutBlueprints.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                    Other Factions ({withoutBlueprints.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {withoutBlueprints.map(f => <FactionCard key={f.name} faction={f} />)}
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}

      {/* All entries view */}
      {view === 'all' && (() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
        const safePage = Math.min(page, totalPages)
        const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

        // Shared sortable column header. Giver column is omitted when grouped —
        // the group header carries the giver. Sort still applies (within groups).
        const columnHeader = (
          <div className="px-4 py-2 flex items-center gap-3 border-b border-sc-border/50 bg-white/[0.02] text-[10px] font-mono uppercase tracking-wider text-gray-500 select-none">
            <button onClick={() => toggleSort('name')} className="flex-1 min-w-0 text-left hover:text-gray-300 transition-colors">
              Mission{sortBy === 'name' && <SortCaret dir={sortDir} />}
            </button>
            {!grouped && (
              <button onClick={() => toggleSort('giver')} className="w-56 text-left shrink-0 hidden md:block hover:text-gray-300 transition-colors">
                Giver{sortBy === 'giver' && <SortCaret dir={sortDir} />}
              </button>
            )}
            <button onClick={() => toggleSort('rep')} className="w-24 text-center shrink-0 hidden sm:block hover:text-gray-300 transition-colors">
              Rep Req{sortBy === 'rep' && <SortCaret dir={sortDir} />}
            </button>
            <span className="w-[4.5rem] text-center shrink-0">Source</span>
            <button onClick={() => toggleSort('reward')} className="w-48 text-right shrink-0 hover:text-gray-300 transition-colors">
              Reward{sortBy === 'reward' && <SortCaret dir={sortDir} />}
            </button>
            <span className="w-16 shrink-0" />
            <span className="w-5 shrink-0" />
          </div>
        )

        const rowProps = (e) => {
          const isMatch = highlightId && (e.contract_id === Number(highlightId) || e.id === `c-${highlightId}`)
          return { entry: e, repFocus: repFilter || null, isHighlighted: !!isMatch, highlightRef: isMatch ? highlightRef : undefined, prerequisites: missionData?.prerequisites, repRequirements: missionData?.rep_requirements, repChanges: missionData?.rep_changes }
        }

        return (
          <>
            <p className="text-xs font-mono text-gray-600">{filtered.length} results</p>
            {filtered.length === 0 ? (
              <div className="panel p-12 text-center">
                <Crosshair className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                <p className="text-gray-500 text-sm">No missions or contracts match your filters.</p>
              </div>
            ) : grouped ? (
              <div className="panel overflow-hidden">
                {columnHeader}
                {groupedEntries.map(g => {
                  const isCollapsed = collapsedGroups.has(g.key)
                  return (
                    <div key={g.key}>
                      <GroupHeader group={g} collapsed={isCollapsed} onToggle={() => toggleGroup(g.key)} />
                      {!isCollapsed && g.entries.map(e => <EntryRow key={e.id} {...rowProps(e)} hideGiver />)}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                <div className="panel overflow-hidden">
                  {columnHeader}
                  {pageSlice.map(e => <EntryRow key={e.id} {...rowProps(e)} />)}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 text-xs font-mono">
                    <button
                      onClick={() => setParam('page', String(safePage - 1))}
                      disabled={safePage <= 1}
                      className="px-3 py-1.5 rounded border border-sc-border/30 text-gray-400 hover:text-white hover:border-sc-accent/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      Prev
                    </button>
                    <span className="text-gray-500">
                      Page {safePage} of {totalPages} <span className="text-gray-700">({filtered.length} total)</span>
                    </span>
                    <button
                      onClick={() => setParam('page', String(safePage + 1))}
                      disabled={safePage >= totalPages}
                      className="px-3 py-1.5 rounded border border-sc-border/30 text-gray-400 hover:text-white hover:border-sc-accent/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )
      })()}

      {/* Reputation view */}
      {view === 'reputation' && (() => {
        // Merge contract generator factions into rep scopes
        const factionReps = (missionGivers || [])
          .filter(g => g.faction_name && g.description)
          .reduce((acc, g) => {
            // Deduplicate by faction name
            if (!acc.some(a => a.name === g.display_name)) {
              acc.push({
                name: g.display_name,
                focus: g.focus,
                generator_key: g.generator_key,
                isFaction: true,
              })
            }
            return acc
          }, [])

        return (
          <>
            {/* Faction rep tracks (from contract generators) */}
            {factionReps.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" /> Faction Reputation ({factionReps.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {factionReps.map(scope => {
                    const logo = getFactionLogo(scope.name)
                    return (
                      <Link
                        key={scope.name}
                        to={`/missions/faction/${scope.faction_slug || scope.name.toLowerCase().replace(/\s+/g, '')}`}
                        className="panel overflow-hidden text-left w-full hover:border-sc-accent/30 transition-colors group flex"
                      >
                        <div className="flex-1 p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-emerald-400 shrink-0" />
                            <h3 className="font-display font-semibold text-white text-sm group-hover:text-sc-accent transition-colors">{scope.name}</h3>
                          </div>
                          {scope.focus && <p className="text-[10px] text-gray-500">{scope.focus}</p>}
                        </div>
                        <div className="w-24 shrink-0 flex items-center justify-center p-2">
                          {logo ? (
                            <img src={logo} alt={scope.name} className="w-16 h-16 object-contain opacity-60 group-hover:opacity-100 transition-opacity" />
                          ) : (
                            <span className="text-xl font-display font-bold text-gray-700 group-hover:text-gray-500 transition-colors">
                              {scope.name.split(/[\s()]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Mission board rep tracks (existing) */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" /> Career Reputation ({repScopes.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {repScopes.map(scope => {
                  const logo = getFactionLogo(scope.name)
                  const initials = scope.name.split(/[\s()]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()
                  return (
                    <button
                      key={scope.slug}
                      onClick={() => setParams({ view: 'all', rep: scope.slug, cat: '', type: '', giver: '', source: '' })}
                      className="panel overflow-hidden text-left w-full hover:border-sc-accent/30 transition-colors group flex"
                    >
                      <div className="flex-1 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-4 h-4 text-emerald-400 shrink-0" />
                          <h3 className="font-display font-semibold text-white text-sm group-hover:text-sc-accent transition-colors">{scope.name}</h3>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sc-accent/10 text-sc-accent border border-sc-accent/20">
                          {scope.missions} missions
                        </span>
                      </div>
                      <div className="w-24 shrink-0 flex items-center justify-center p-2">
                        {logo ? (
                          <img src={logo} alt={scope.name} className="w-16 h-16 object-contain opacity-60 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <span className="text-xl font-display font-bold text-gray-700 group-hover:text-gray-500 transition-colors">{initials}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
