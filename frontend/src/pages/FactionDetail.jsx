import React, { useState, useMemo } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useGoBack } from '../hooks/useGoBack'
import { ArrowLeft, MapPin, FlaskConical, Shield, Users, Building2, ChevronRight, Coins, FileText, Info, Briefcase, Scale, Swords, HeartHandshake, Lock, ChevronDown, Trophy, Package } from 'lucide-react'
import { useFactionDetail } from '../hooks/useAPI'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { FACTION_LOGOS, GUILD_LABELS, RANKS, SYSTEM_COLORS, DIFF_COLORS, DIFF_LABELS, cleanDesc, humanizeFactionSlug, humanizeScopeSlug, humanizeStandingSlug, humanizeComparison, formatRepRequirement } from '../lib/missionConstants'

// Human-friendly descriptions for mission types from contract generators
const MISSION_TYPE_DESCRIPTIONS = {
  "Recovery": "Travel to a location and recover a lost item, then deliver it to the client.",
  "Recovery (Unlawful)": "Recover items from restricted or contested areas. May involve illegal activity.",
  "Recovery + Combat": "Recover an item from a hostile location. Expect armed resistance.",
  "Black Box Recovery": "Locate and retrieve a ship's black box flight recorder from a wreck site.",
  "Elimination": "Locate and eliminate a specific target at a known location.",
  "Ship Defense": "Protect a friendly ship from incoming hostile waves.",
  "Defend Assets": "Defend structures or cargo from attack until reinforcements arrive.",
  "Escort": "Escort a ship or convoy safely through dangerous space.",
  "Patrol": "Patrol a designated area and engage any hostile contacts.",
  "Ship Wave Attack": "Engage and destroy waves of incoming hostile ships.",
  "Ambush": "Set up and execute an ambush on hostile forces.",
  "Bounty": "Track down and neutralize a bounty target.",
  "Bounty (FPS)": "Hunt and eliminate a target on foot at a ground location.",
  "Data Recovery": "Retrieve encrypted data from a terminal or device at a target location.",
  "Investigation": "Investigate a location and report findings back to the client.",
  "Missing Person": "Search for a missing person and determine their fate.",
  "Cargo Recovery": "Locate and recover lost cargo, then deliver it to the client.",
  "Mining (FPS)": "Hand-mine resources at a designated location and deliver them.",
  "Mining (Ship)": "Mine asteroids or surface deposits using a mining ship.",
  "Mining (Ground)": "Mine surface deposits using a ground vehicle.",
  "Salvage (FPS)": "Salvage materials from a wreck on foot.",
  "Salvage (Ship)": "Salvage a derelict ship using salvage equipment.",
  "Hauling": "Transport cargo between two locations.",
  "Delivery": "Pick up a package and deliver it to the destination.",
  "Facility Raid": "Assault a hostile facility and complete objectives inside.",
  "Animal Hunt": "Track and eliminate dangerous wildlife.",
  "Hunt & Collect": "Hunt animals and collect specimens for the client.",
  "Assassination": "Eliminate a high-value target.",
  "Ship Hijack": "Board and take control of a target ship.",
  "Criminal Bounties": "Eliminate criminal targets in open space.",
  "Collection": "Collect specific items and deliver them to the client.",
  "Resource Gathering": "Gather resources from the environment and deliver them.",
}

// ── Area loot hints — maps mission type → likely container location keys ──────
// v1 heuristic: not every mission of a type goes to every location, but these are
// the locations players commonly encounter when running each mission type.
const MISSION_CATEGORY_LOCATIONS = {
  Mercenary:       ['UGFs', 'ColonialOutpost', 'DCDelving'],
  Theft:           ['UGFs', 'ColonialOutpost'],
  Recovery:        ['Derelict', 'Caves'],
  'Recovery + Combat': ['UGFs', 'ColonialOutpost', 'Derelict'],
  'Recovery (Unlawful)': ['UGFs', 'ColonialOutpost'],
  Exploration:     ['Caves', 'Derelict'],
  'Combined Ops':  ['UGFs', 'DCDelving'],
  'Facility Raid': ['UGFs', 'ASDDelving', 'DCDelving'],
  'Bounty (FPS)':  ['UGFs', 'ColonialOutpost', 'Caves'],
  Elimination:     ['UGFs', 'ColonialOutpost', 'DCDelving'],
  Investigation:   ['Derelict', 'Caves'],
  'Data Recovery': ['UGFs', 'ColonialOutpost'],
  'Missing Person': ['Caves', 'Derelict'],
}

// location_key → { label, poiPath } for building area loot hint links
const AREA_LOOT_LOCATIONS = {
  UGFs:            { label: 'Bunkers', path: '/poi/UGFs' },
  ColonialOutpost: { label: 'Colonial Outposts', path: '/poi/ColonialOutpost' },
  DCDelving:       { label: 'Distribution Centres', path: '/poi/DCDelving' },
  Caves:           { label: 'Caves', path: '/poi/Caves' },
  Derelict:        { label: 'Derelicts', path: '/poi/Derelict' },
  ASDDelving:      { label: 'ASD Facilities', path: '/poi/ASDDelving' },
}

// Local formatRepReward for FactionDetail — uses shared humanizers from missionConstants
function formatRepReward(raw) {
  if (!raw) return null
  return raw.split(/,\s*/).map(part => {
    const match = part.match(/^([+-]?\d+)\s*(.*)$/)
    if (!match) return part.trim()
    const amount = match[1]
    const slug = match[2].trim()
    const name = humanizeFactionSlug(slug)
    return name ? `${amount} ${name}` : amount
  }).join(', ')
}

// ── Reputation Tier Ladder ──────────────────────────────────────────
function RepTierLadder({ repLadder }) {
  const [expanded, setExpanded] = useState(false)

  if (!repLadder || !repLadder.standings || repLadder.standings.length === 0) return null

  const standings = repLadder.standings
  const COLLAPSE_THRESHOLD = 6
  const shouldCollapse = standings.length > COLLAPSE_THRESHOLD
  const isOpen = !shouldCollapse || expanded

  // Color gradient from dim (low tiers) to bright (high tiers)
  const TIER_COLORS = [
    { bg: 'bg-gray-500/8', text: 'text-gray-500', border: 'border-gray-500/15', bar: 'bg-gray-500/20' },
    { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', bar: 'bg-gray-500/30' },
    { bg: 'bg-blue-500/8', text: 'text-blue-400', border: 'border-blue-500/15', bar: 'bg-blue-500/20' },
    { bg: 'bg-cyan-500/8', text: 'text-cyan-400', border: 'border-cyan-500/15', bar: 'bg-cyan-500/20' },
    { bg: 'bg-emerald-500/8', text: 'text-emerald-400', border: 'border-emerald-500/15', bar: 'bg-emerald-500/25' },
    { bg: 'bg-amber-500/8', text: 'text-amber-400', border: 'border-amber-500/15', bar: 'bg-amber-500/25' },
    { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', bar: 'bg-orange-500/30' },
    { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', bar: 'bg-red-500/30' },
    { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', bar: 'bg-purple-500/30' },
    { bg: 'bg-fuchsia-500/12', text: 'text-fuchsia-400', border: 'border-fuchsia-500/25', bar: 'bg-fuchsia-500/35' },
  ]

  function tierColor(index, total) {
    const scaled = total <= 1 ? 0 : Math.round((index / (total - 1)) * (TIER_COLORS.length - 1))
    return TIER_COLORS[Math.min(scaled, TIER_COLORS.length - 1)]
  }

  // Find max rep for the progress bar scaling
  const maxRep = Math.max(...standings.map(s => s.min_reputation), 1)

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <h2 className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5" /> Reputation Progression
          <span className="text-gray-600 normal-case tracking-normal">({repLadder.scope_name})</span>
        </h2>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-5 pb-4 space-y-1">
          {standings.map((standing, i) => {
            const colors = tierColor(i, standings.length)
            const barWidth = maxRep > 0 ? Math.max((standing.min_reputation / maxRep) * 100, 2) : 2
            const perkText = standing.perks?.length > 0
              ? standing.perks.map(p => p.display_name || p.perk_name).join(', ')
              : standing.perk_description

            return (
              <div
                key={standing.slug || i}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${colors.border} ${colors.bg} transition-all`}
              >
                {/* Rank number */}
                <span className={`text-[10px] font-mono w-5 text-center ${colors.text} opacity-60`}>{i + 1}</span>

                {/* Rank name + lock icon */}
                <div className="w-36 shrink-0 flex items-center gap-1.5">
                  {standing.is_gated ? <Lock className="w-3 h-3 text-amber-400/60 shrink-0" /> : null}
                  <span className={`text-xs font-medium ${colors.text}`}>
                    {humanizeStandingSlug(standing.name)}
                  </span>
                </div>

                {/* Rep bar + value */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors.bar} transition-all`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 w-12 text-right shrink-0">
                      {standing.min_reputation.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Perk description */}
                {perkText && (
                  <span className="text-[10px] text-gray-500 max-w-[180px] truncate shrink-0" title={perkText}>
                    {perkText}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Mission Detail Panel (slides in from right) ──────────────────────
function MissionDetailPanel({ mission, type, onBack, prerequisites, repRequirements }) {
  const isGenerator = type === 'generator'
  const isPuMission = type === 'pu_mission'
  const isContract = type === 'contract'

  // Look up prereqs and rep requirements for this pu_mission
  const missionPrereqs = isPuMission && mission.id ? (prerequisites?.[mission.id] || []) : []
  const missionRepReqs = isPuMission && mission.id ? (repRequirements?.[mission.id] || []) : []

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sc-accent transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to missions
      </button>

      {isGenerator && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 mb-2 inline-block">
              {mission.mission_type}
            </span>
            <h2 className="text-lg font-bold text-white mb-2">{mission.mission_type}</h2>

            {/* Mission description */}
            {MISSION_TYPE_DESCRIPTIONS[mission.mission_type] && (
              <p className="text-sm text-gray-400 leading-relaxed mb-3">{MISSION_TYPE_DESCRIPTIONS[mission.mission_type]}</p>
            )}

            {/* Systems */}
            {mission.systems?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {mission.systems.map(sys => (
                  <span key={sys} className={`text-[10px] px-2 py-0.5 rounded ${SYSTEM_COLORS[sys]?.split(' ').slice(0, 2).join(' ') || 'bg-gray-500/10 text-gray-400'}`}>
                    {sys}
                  </span>
                ))}
              </div>
            )}

            {/* Difficulty tiers */}
            {mission.tiers?.length > 0 && (
              <div className="border border-white/[0.06] rounded-lg overflow-hidden mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                      <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 py-2">Difficulty</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 py-2">Min Rank</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 py-2">Rep Reward</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 py-2">aUEC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mission.tiers.map(t => (
                      <tr key={t.difficulty} className="border-b border-white/[0.04] last:border-0">
                        <td className={`px-3 py-1.5 text-xs font-medium ${DIFF_COLORS[t.difficulty] || 'text-gray-400'}`}>
                          {DIFF_LABELS[t.difficulty] || t.difficulty}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">{RANKS[t.min_rank]?.name || `Rank ${t.min_rank}`}</td>
                        <td className="px-3 py-1.5 text-xs font-mono">
                          {t.rep_rewards?.length > 0 ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {t.rep_rewards.map((r, ri) => (
                                <span key={ri} className={r.amount > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                  {r.amount > 0 ? '+' : ''}{r.amount.toLocaleString()}
                                  <span className="text-gray-600 ml-0.5 text-[9px] font-normal">{humanizeFactionSlug(r.faction_slug)}</span>
                                </span>
                              ))}
                            </div>
                          ) : t.rep_reward ? (
                            <span className="text-emerald-400">{formatRepReward(String(t.rep_reward))}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-[10px] text-gray-600 italic">Dynamic</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Blueprint pools */}
          {mission.blueprint_pools?.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5" /> Blueprint Rewards
              </h3>
              {mission.blueprint_pools.map((pool, pi) => (
                <div key={pi} className="mb-3 last:mb-0">
                  {pool.chance < 1 && (
                    <span className="text-[10px] text-gray-600 mb-1 block">{Math.round(pool.chance * 100)}% drop chance</span>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {pool.blueprints.map(bp => (
                      <Link key={bp.id} to={`/crafting/${bp.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/[0.02] border border-white/[0.06] hover:border-sc-accent/20 text-xs text-gray-300 hover:text-white transition-all">
                        <span className={`px-1 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          bp.type === 'weapons' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                          bp.type === 'armour' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' :
                          'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>{bp.type}</span>
                        {bp.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-sc-accent/5 border border-sc-accent/10">
                <Info className="w-3.5 h-3.5 text-sc-accent mt-0.5 shrink-0" />
                <p className="text-[10px] text-gray-400">Blueprint drops are the same at all difficulty levels.</p>
              </div>
            </div>
          )}

          {/* Area loot hints */}
          {(() => {
            const locations = MISSION_CATEGORY_LOCATIONS[mission.mission_type]
            if (!locations || locations.length === 0) return null
            return (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5" /> Loot at Mission Locations
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {locations.map(key => {
                    const loc = AREA_LOOT_LOCATIONS[key]
                    if (!loc) return null
                    return (
                      <Link
                        key={key}
                        to={loc.path}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-sc-accent bg-sc-accent/5 border border-sc-accent/15 hover:bg-sc-accent/10 hover:border-sc-accent/30 transition-all"
                      >
                        <MapPin className="w-3 h-3" />
                        {loc.label}
                        <ChevronRight className="w-3 h-3 opacity-50" />
                      </Link>
                    )
                  })}
                </div>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <Info className="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-gray-500">Items commonly found at locations used by this mission type. Actual loot varies by location.</p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {isPuMission && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-bold text-white">{mission.title}</h2>
          <div className="flex flex-wrap gap-2">
            {mission.category && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-gray-500">{mission.category}</span>
            )}
            {mission.difficulty && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-gray-500">{mission.difficulty}</span>
            )}
            {!mission.is_lawful && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Unlawful</span>
            )}
          </div>
          {mission.reward_amount > 0 && (
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-mono text-amber-400">{mission.reward_amount.toLocaleString()}</span>
              <span className="text-xs text-gray-500">{mission.reward_currency || 'aUEC'}</span>
            </div>
          )}
          {mission.rep_summary && (
            <div className="text-xs font-mono">
              <span className="text-gray-500">Rep: </span>
              {mission.rep_summary.split(', ').map((r, i) => (
                <span key={i} className={`${r.includes('+') ? 'text-emerald-400' : 'text-red-400'} ${i > 0 ? 'ml-1.5' : ''}`}>
                  {r}{i < mission.rep_summary.split(', ').length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
          )}
          {mission.description && (
            <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{cleanDesc(mission.description)}</p>
          )}

          {/* Prerequisites */}
          {missionPrereqs.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Prerequisites</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missionPrereqs.map((p, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {p.title || p.uuid?.slice(0, 8)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reputation requirements */}
          {missionRepReqs.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">Reputation Required</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missionRepReqs.map((r, i) => {
                  const fmt = formatRepRequirement(r)
                  if (!fmt) return null
                  return (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {fmt.label || (<>{fmt.standing} {fmt.cmp} with <span className="font-medium text-blue-300">{fmt.faction}</span>{fmt.scope ? ` (${fmt.scope})` : ''}</>)}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Area loot hints for pu_missions */}
          {(() => {
            const locations = MISSION_CATEGORY_LOCATIONS[mission.category]
            if (!locations || locations.length === 0) return null
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-gray-500" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Loot at Mission Locations</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {locations.map(key => {
                    const loc = AREA_LOOT_LOCATIONS[key]
                    if (!loc) return null
                    return (
                      <Link
                        key={key}
                        to={loc.path}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-sc-accent bg-sc-accent/5 border border-sc-accent/15 hover:bg-sc-accent/10 hover:border-sc-accent/30 transition-all"
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        {loc.label}
                      </Link>
                    )
                  })}
                </div>
                <p className="text-[9px] text-gray-600 pl-4">Items commonly found at locations used by this mission type</p>
              </div>
            )
          })()}
        </div>
      )}

      {isContract && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-bold text-white">{mission.title}</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 inline-block">{mission.category}</span>
          {mission.reward_amount > 0 && (
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-mono text-amber-400">{mission.reward_amount.toLocaleString()}</span>
              <span className="text-xs text-gray-500">aUEC</span>
            </div>
          )}
          {mission.reward_text && (
            <div className="text-xs text-gray-400">Reward: <span className="text-sc-accent2">{mission.reward_text}</span></div>
          )}
          {mission.description && (
            <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{cleanDesc(mission.description)}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Faction Detail ─────────────────────────────────────────────
export default function FactionDetail() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('type') || ''
  const { data, loading, error, refetch } = useFactionDetail(slug)
  // Back to wherever the user came from; fall back to the factions list only
  // on a direct landing.
  const goBack = useGoBack('/missions?view=factions')

  // Selected mission from URL query string — deep-linkable
  const missionParam = searchParams.get('mission') || ''
  const setSelectedMission = (mission) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (mission) next.set('mission', mission.id)
      else next.delete('mission')
      return next
    })
  }

  // Build unified mission list
  const allMissions = useMemo(() => {
    if (!data) return []
    const missions = []

    // Generators → one entry per mission type
    for (const gen of (data.generators || [])) {
      const hasBP = gen.blueprint_pools?.some(p => p.blueprints?.length > 0)
      const bpCount = hasBP
        ? gen.blueprint_pools.reduce((sum, p) => sum + (p.blueprints?.length || 0), 0)
        : 0
      missions.push({
        id: `gen-${gen.key}`,
        type: 'generator',
        title: gen.mission_type || 'Mission',
        category: gen.mission_type,
        source: hasBP ? 'blueprint' : 'dynamic',
        data: gen,
        hasBP,
        bpCount,
        reward: null,
      })
    }

    // pu_missions — skip completely empty stubs
    for (const m of (data.pu_missions || [])) {
      if (!m.description && !(m.reward_amount > 0)) continue
      missions.push({
        id: `pu-${m.id}`,
        type: 'pu_mission',
        title: m.title,
        category: m.category,
        source: 'mission_board',
        data: m,
        hasBP: false,
        reward: m.reward_amount,
      })
    }

    // contracts
    for (const c of (data.contracts || [])) {
      missions.push({
        id: `contract-${c.id}`,
        type: 'contract',
        title: c.title,
        category: c.category,
        source: 'contract',
        data: c,
        hasBP: false,
        reward: c.reward_amount,
      })
    }

    return missions
  }, [data])

  // Category filter pills
  const categories = useMemo(() => {
    const counts = {}
    for (const m of allMissions) {
      const cat = m.category || 'Other'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a)
  }, [allMissions])

  const filtered = typeFilter
    ? allMissions.filter(m => m.category === typeFilter)
    : allMissions

  // Resolve selected mission from URL param
  const selectedMission = missionParam
    ? allMissions.find(m => m.id === missionParam) || null
    : null
  const isDetailView = !!missionParam

  if (loading) return <LoadingState fullScreen message="Loading faction..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Shield className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Faction Not Found</h2>
        <button onClick={goBack} className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors">&larr; Back</button>
      </div>
    )
  }

  const { faction, systems, stats } = data
  const logo = FACTION_LOGOS[slug] || FACTION_LOGOS[faction.faction_slug]
  const guildLabel = GUILD_LABELS[faction.guild] || ''

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sc-accent transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-sc-accent/20 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-sc-accent/20 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-sc-accent/20 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-sc-accent/20 rounded-br-2xl" />

        <div className="flex items-start gap-6">
          {logo && <img src={logo} alt={faction.display_name} className="w-36 h-36 rounded-xl border border-white/[0.08] object-cover shrink-0 shadow-lg shadow-black/30 bg-white/[0.02]" />}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {guildLabel && <span className="px-2 py-0.5 rounded text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06] uppercase tracking-wider">{guildLabel}</span>}
              {faction.is_lawful != null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                  faction.is_lawful ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  <Scale className="w-2.5 h-2.5" />
                  {faction.is_lawful ? 'Lawful' : 'Unlawful'}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide mt-1 mb-1" style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.15)' }}>
              {faction.display_name}
            </h1>
            {faction.focus && <p className="text-sm text-gray-400 mb-2">{faction.focus}</p>}
            {faction.description && <p className="text-sm text-gray-500 leading-relaxed mb-2">{faction.description}</p>}

            {/* Occupation and Association */}
            {(faction.occupation || faction.association) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400 mb-2">
                {faction.occupation && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3 h-3 text-gray-600" /> {faction.occupation}
                  </span>
                )}
                {faction.association && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-gray-600" /> {faction.association}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              {faction.headquarters && <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3 text-gray-600" /> HQ: {faction.headquarters}</span>}
              {faction.leadership && <span className="flex items-center gap-1.5"><Users className="w-3 h-3 text-gray-600" /> Led by {faction.leadership}</span>}
            </div>

            {/* Biography */}
            {faction.biography && (
              <p className="text-sm text-gray-500/80 leading-relaxed mt-3 italic border-l-2 border-white/[0.06] pl-3">
                {faction.biography}
              </p>
            )}

            {/* Allies and Enemies */}
            {(faction.allies_json || faction.enemies_json) && (() => {
              const allies = faction.allies_json ? (() => { try { return JSON.parse(faction.allies_json) } catch { return [] } })() : []
              const enemies = faction.enemies_json ? (() => { try { return JSON.parse(faction.enemies_json) } catch { return [] } })() : []
              return (allies.length > 0 || enemies.length > 0) ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 mt-2">
                  {allies.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <HeartHandshake className="w-3 h-3 text-emerald-500/60" />
                      <span className="text-gray-600">Allies:</span> {allies.join(', ')}
                    </span>
                  )}
                  {enemies.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Swords className="w-3 h-3 text-red-500/60" />
                      <span className="text-gray-600">Rivals:</span> {enemies.join(', ')}
                    </span>
                  )}
                </div>
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* Reputation Progression */}
      {data.rep_ladder && <RepTierLadder repLadder={data.rep_ladder} />}

      {/* Stats pills */}
      <div className="flex flex-wrap items-center gap-3">
        {systems.length > 0 && systems.map(sys => (
          <span key={sys} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${SYSTEM_COLORS[sys] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
            <MapPin className="w-3.5 h-3.5" /> {sys}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-white/[0.04] text-gray-400 border-white/[0.06]">
          <FileText className="w-3.5 h-3.5" /> {stats.mission_count} missions
        </span>
        {stats.blueprint_count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            <FlaskConical className="w-3.5 h-3.5" /> {stats.blueprint_count} blueprints
          </span>
        )}
      </div>

      {/* Slide container — both panels share one grid cell so the container
          sizes to whichever is taller. (Absolute-positioning the detail panel
          removed it from flow, so a tall blueprint list overflowed the
          list-height container and got clipped — #147 / #163.) */}
      <div className="relative grid overflow-hidden min-h-[200px]">
        {/* Mission list */}
        <div
          className={`col-start-1 row-start-1 transition-all duration-500 ease-in-out ${isDetailView ? 'pointer-events-none' : ''}`}
          style={{ transform: isDetailView ? 'translateX(-100%)' : 'translateX(0)', opacity: isDetailView ? 0 : 1 }}
        >
          {/* Category filter */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button onClick={() => setSearchParams({})}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${!typeFilter ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30' : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12]'}`}>
                All ({allMissions.length})
              </button>
              {categories.map(([cat, count]) => (
                <button key={cat} onClick={() => setSearchParams({ type: cat })}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${typeFilter === cat ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/30' : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.12]'}`}>
                  {cat} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Mission rows */}
          <div className="space-y-1.5">
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMission(m)}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:border-sc-accent/20 hover:bg-white/[0.04] transition-all group text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      m.source === 'blueprint' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      m.source === 'contract' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      'bg-white/[0.04] text-gray-500 border-white/[0.06]'
                    }`}>{m.source === 'blueprint' ? 'Blueprint Mission' : m.source === 'contract' ? 'Contract' : 'Mission Board'}</span>
                    {m.category && <span className="text-[9px] text-gray-600">{m.category}</span>}
                  </div>
                  <h3 className="text-sm text-gray-200 group-hover:text-white transition-colors truncate">{m.title}</h3>
                </div>
                {m.hasBP && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0" title={`${m.bpCount || ''} blueprint${m.bpCount === 1 ? '' : 's'}`}>
                    <FlaskConical className="w-3 h-3 text-emerald-400" />
                    {m.bpCount > 0 && <span className="text-[9px] font-mono text-emerald-400">{m.bpCount}</span>}
                  </span>
                )}
                {m.type === 'pu_mission' && (data.prerequisites?.[m.data.id]?.length > 0 || data.rep_requirements?.[m.data.id]?.length > 0) && (
                  <Lock className="w-3.5 h-3.5 text-amber-400/60 shrink-0" title="Has prerequisites or reputation requirements" />
                )}
                {m.reward > 0 && (
                  <span className="text-xs font-mono text-amber-400 shrink-0">{m.reward.toLocaleString()} aUEC</span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-sc-accent transition-colors shrink-0" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">No missions found for this filter.</div>
            )}
          </div>
        </div>

        {/* Mission detail (slides in from right) */}
        <div
          className={`col-start-1 row-start-1 transition-all duration-500 ease-in-out ${!isDetailView ? 'pointer-events-none' : ''}`}
          style={{ transform: isDetailView ? 'translateX(0)' : 'translateX(100%)', opacity: isDetailView ? 1 : 0 }}
        >
          {selectedMission && (
            <MissionDetailPanel
              mission={selectedMission.data}
              type={selectedMission.type}
              onBack={() => setSelectedMission(null)}
              prerequisites={data.prerequisites}
              repRequirements={data.rep_requirements}
            />
          )}
        </div>
      </div>
    </div>
  )
}
