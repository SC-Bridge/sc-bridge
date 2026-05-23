import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, FileText, MapPin, FlaskConical, Shield, Users, Building2, Info, Briefcase, Scale, Swords, HeartHandshake } from 'lucide-react'
import { useMissionDetail } from '../hooks/useAPI'
import { useGoBack } from '../hooks/useGoBack'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import { FACTION_LOGOS, GUILD_LABELS, RANKS, SYSTEM_COLORS, DIFF_COLORS, DIFF_BAR_COLORS, DIFF_BAR_GLOW, DIFF_LABELS, TYPE_COLORS, TYPE_LABELS } from '../lib/missionConstants'

function formatRep(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function RepProgressionBar({ tiers }) {
  return (
    <div>
      {/* Rep thresholds above */}
      <div className="flex mb-1">
        {RANKS.map((r, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] font-mono text-gray-500">{formatRep(r.min_rep)}</span>
          </div>
        ))}
      </div>

      {/* Bar — taller, with glow on active segments */}
      <div className="flex h-5 rounded-lg overflow-hidden bg-white/[0.03] border border-white/[0.06]">
        {RANKS.map((r, i) => {
          const tier = tiers.find(t => t.min_rank === i)
          const barColor = tier ? (DIFF_BAR_COLORS[tier.difficulty] || 'bg-gray-500/30') : 'bg-white/[0.02]'
          const glow = tier ? (DIFF_BAR_GLOW[tier.difficulty] || '') : ''
          return (
            <div
              key={i}
              className={`flex-1 ${barColor} ${glow} ${i > 0 ? 'border-l border-white/[0.08]' : ''} flex items-center justify-center transition-all`}
              title={tier ? `${DIFF_LABELS[tier.difficulty] || tier.difficulty} — ${r.name}` : r.name}
            >
              {tier && (
                <span className={`text-[8px] font-bold uppercase tracking-wider ${DIFF_COLORS[tier.difficulty] || 'text-gray-500'} drop-shadow-sm`}>
                  {(DIFF_LABELS[tier.difficulty] || tier.difficulty).slice(0, 6)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Rank names below */}
      <div className="flex mt-1">
        {RANKS.map((r, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-gray-400 leading-tight">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MissionDetail() {
  const { key } = useParams()
  const { data, loading, error, refetch } = useMissionDetail(key)
  // Return the user to wherever they came from (crafting detail, missions list,
  // …); only fall back to the factions list on a direct landing.
  const goBack = useGoBack('/missions?view=factions')

  if (loading) return <LoadingState fullScreen message="Loading mission..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Mission Not Found</h2>
        <button onClick={goBack} className="text-sm text-sc-accent hover:text-sc-accent/80 transition-colors">&larr; Back</button>
      </div>
    )
  }

  const { generator, systems, tiers, all_blueprints } = data
  const logo = FACTION_LOGOS[generator.display_name] || FACTION_LOGOS[generator.faction_name]
  const guildLabel = GUILD_LABELS[generator.guild] || generator.guild?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const bpByType = {}
  for (const bp of all_blueprints) {
    const t = bp.type || 'other'
    if (!bpByType[t]) bpByType[t] = []
    bpByType[t].push(bp)
  }
  const typeOrder = ['weapons', 'armour', 'ammo'].filter(t => bpByType[t])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sc-accent transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* ── Header — logo prominent on left, info on right ── */}
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-sc-accent/20 rounded-tl-2xl" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-sc-accent/20 rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-sc-accent/20 rounded-bl-2xl" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-sc-accent/20 rounded-br-2xl" />

        <div className="flex items-start gap-6">
          {/* Logo — large and prominent, matches card height */}
          {logo && (
            <img src={logo} alt={generator.display_name} className="w-36 h-36 rounded-xl border border-white/[0.08] object-cover shrink-0 shadow-lg shadow-black/30 bg-white/[0.02]" />
          )}

          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {guildLabel && (
                <span className="px-2 py-0.5 rounded text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06] uppercase tracking-wider">{guildLabel}</span>
              )}
              <span className="px-2 py-0.5 rounded text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20">{generator.mission_type}</span>
              {generator.is_lawful != null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                  generator.is_lawful ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  <Scale className="w-2.5 h-2.5" />
                  {generator.is_lawful ? 'Lawful' : 'Unlawful'}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-2xl font-bold text-white tracking-wide mb-1" style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.15)' }}>
              {generator.display_name}
            </h1>

            {/* Focus */}
            {generator.focus && (
              <p className="text-sm text-gray-400 mb-3">{generator.focus}</p>
            )}

            {/* Description */}
            {generator.description && (
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{generator.description}</p>
            )}

            {/* Occupation and Association */}
            {(generator.occupation || generator.association) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400 mb-3">
                {generator.occupation && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3 h-3 text-gray-600" /> {generator.occupation}
                  </span>
                )}
                {generator.association && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-gray-600" /> {generator.association}
                  </span>
                )}
              </div>
            )}

            {/* Faction meta */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              {generator.headquarters && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-gray-600" />
                  HQ: {generator.headquarters}
                </span>
              )}
              {generator.leadership && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-gray-600" />
                  Led by {generator.leadership}
                </span>
              )}
            </div>

            {/* Biography */}
            {generator.biography && (
              <p className="text-sm text-gray-500/80 leading-relaxed mt-3 italic border-l-2 border-white/[0.06] pl-3">
                {generator.biography}
              </p>
            )}

            {/* Allies and Enemies */}
            {(generator.allies_json || generator.enemies_json) && (() => {
              const allies = generator.allies_json ? (() => { try { return JSON.parse(generator.allies_json) } catch { return [] } })() : []
              const enemies = generator.enemies_json ? (() => { try { return JSON.parse(generator.enemies_json) } catch { return [] } })() : []
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

      {/* ── Systems + HQ ── */}
      {systems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-gray-600">Missions available in</span>
          {systems.map(sys => (
            <span key={sys} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${SYSTEM_COLORS[sys] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
              <MapPin className="w-3.5 h-3.5" /> {sys}
            </span>
          ))}
        </div>
      )}

      {/* ── Difficulty tiers ── */}
      {tiers && tiers.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Mission Difficulty
          </h2>

          {/* Rep progression bar */}
          <RepProgressionBar tiers={tiers} />

          {/* Tier table */}
          <div className="border border-white/[0.06] rounded-lg overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Mission Difficulty</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Required Rank</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium px-4 py-2.5">Rep Reward</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(tier => {
                  const rankInfo = RANKS[tier.min_rank] || { name: `Rank ${tier.min_rank}`, min_rep: 0 }
                  return (
                    <tr key={tier.difficulty} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className={`px-4 py-2.5 text-xs font-medium ${DIFF_COLORS[tier.difficulty] || 'text-gray-400'}`}>
                        {DIFF_LABELS[tier.difficulty] || tier.difficulty}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {rankInfo.name}
                        <span className="text-gray-600 ml-1.5 font-mono text-[10px]">
                          ({formatRep(rankInfo.min_rep)} rep)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                        {tier.rep_reward ? (
                          <span className="text-emerald-400">+{tier.rep_reward}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Blueprint pool note */}
          {all_blueprints.length > 0 && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-sc-accent/5 border border-sc-accent/10">
              <Info className="w-3.5 h-3.5 text-sc-accent mt-0.5 shrink-0" />
              <p className="text-xs text-gray-400">
                <span className="text-sc-accent font-medium">Blueprint drops are the same at all difficulty levels.</span>{' '}
                Higher difficulty increases aUEC and reputation rewards, not the blueprint loot pool.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Blueprint rewards ── */}
      {all_blueprints.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
            <FlaskConical className="w-3.5 h-3.5" /> Blueprint Rewards ({all_blueprints.length})
          </h2>
          <div className="space-y-4">
            {typeOrder.map(type => {
              const bps = bpByType[type]
              const tc = TYPE_COLORS[type] || {}
              return (
                <div key={type}>
                  <h3 className={`text-xs font-medium uppercase tracking-wider mb-2 ${tc.text || 'text-gray-400'}`}>
                    {TYPE_LABELS[type] || type} ({bps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {bps.map(bp => {
                      const btc = TYPE_COLORS[bp.type] || { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' }
                      return (
                        <Link
                          key={bp.id}
                          to={`/crafting/${bp.id}`}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-sc-accent/20 hover:bg-white/[0.04] transition-all group"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${btc.bg} ${btc.text} border ${btc.border}`}>
                            {TYPE_LABELS[bp.type] || bp.type}
                          </span>
                          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{bp.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
