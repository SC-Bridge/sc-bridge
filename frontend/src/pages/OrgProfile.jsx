import React, { useState, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import {
  ExternalLink, Users, Rocket, BarChart3, Building2, Globe,
  MessageSquare, Tv, Youtube, Settings, ShieldCheck, ChevronDown, Crosshair
} from 'lucide-react'
import { useOrgProfile, useOrgFleet, useOrgMembers, useOrgAnalysis, useStatus } from '../hooks/useAPI'
import { useSession } from '../lib/auth-client'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import ShipImage from '../components/ShipImage'
import OrgOpsList from './OrgOps/index'
import CreateOp from './OrgOps/CreateOp'

const RSI_BASE = 'https://robertsspaceindustries.com'

const ALL_TABS = [
  { id: 'fleet', label: 'Fleet', icon: Rocket },
  { id: 'ops', label: 'Ops', icon: Crosshair, featureFlag: 'ops' },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'about', label: 'About', icon: Building2 },
]

const ROLE_BADGE = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  admin: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  member: 'text-gray-400 bg-white/5 border-sc-border',
}

const VISIBILITY_LABELS = {
  public: { label: 'Public', color: 'text-green-400' },
  org: { label: 'Org', color: 'text-blue-400' },
  officers: { label: 'Officers', color: 'text-amber-400' },
  private: { label: 'Private', color: 'text-gray-500' },
}

function OrgFleet({ slug, callerRole }) {
  const { data, loading, error, refetch } = useOrgFleet(slug)
  if (loading) return <LoadingState message="Loading fleet..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const fleet = data?.fleet ?? []

  if (fleet.length === 0) {
    // F258: empty-fleet has three distinct causes — surface each clearly
    // instead of a single ambiguous "No ships visible to you".
    // 1. Non-member: they need to join first.
    // 2. Org owner/admin: members haven't flipped ship visibility up.
    // 3. Regular member: same as owner — nobody shared ships yet.
    return (
      <div className="text-center py-16 text-gray-500">
        <Rocket className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        {!callerRole ? (
          <>
            <p className="text-sm">No ships visible to you</p>
            <p className="text-xs mt-1">Join the org to see member ships</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400">No ships shared with this org yet</p>
            <p className="text-xs mt-1 max-w-md mx-auto">
              Each ship in your personal fleet defaults to <span className="font-mono text-gray-400">Private</span>.
              Flip the visibility to <span className="font-mono text-gray-400">Org</span> on <Link to="/fleet" className="text-sc-accent hover:underline">your fleet page</Link> to share ships with members.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-mono">{fleet.length} ships</p>
      <div className="grid gap-2">
        {fleet.map((ship) => (
          <div key={ship.id} className="flex items-center gap-3 p-2 rounded border border-sc-border/50 bg-white/[0.02]">
            <ShipImage render={ship.render} src={ship.image_url} alt={ship.vehicle_name} aspectRatio="thumbnail" className="w-12 rounded border border-sc-border/50 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-white truncate">{ship.vehicle_name}</span>
                {ship.available_for_ops ? (
                  <span className="text-[10px] uppercase tracking-widest text-green-400 bg-green-400/10 border border-green-400/30 px-1 py-0.5 rounded font-display shrink-0">Ops Ready</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{ship.manufacturer_name}</span>
                {ship.focus && <span className="text-xs text-gray-600">· {ship.focus}</span>}
                {ship.owner_name && <span className="text-xs text-gray-600">· {ship.owner_name}</span>}
              </div>
            </div>
            {callerRole && ship.org_visibility && (
              <span className={`text-[10px] font-mono shrink-0 ${VISIBILITY_LABELS[ship.org_visibility]?.color ?? 'text-gray-500'}`}>
                {VISIBILITY_LABELS[ship.org_visibility]?.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OrgMembers({ slug }) {
  const { data, loading, error, refetch } = useOrgMembers(slug)
  if (loading) return <LoadingState message="Loading members..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const members = data?.members ?? []

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-mono">{members.length} {members.length === 1 ? 'member' : 'members'}</p>
      <div className="grid gap-1">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded border border-sc-border/50 bg-white/[0.02]">
            {m.userImage ? (
              <img src={m.userImage} alt={m.userName} className="w-7 h-7 rounded-full border border-sc-border shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full border border-sc-border bg-sc-darker flex items-center justify-center text-xs text-gray-500 shrink-0">
                {(m.userName || m.userEmail || '?')[0].toUpperCase()}
              </div>
            )}
            <span className="flex-1 text-sm text-gray-300 truncate">{m.userName || m.userEmail}</span>
            <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border font-display ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrgAnalysis({ slug }) {
  const { data, loading, error, refetch } = useOrgAnalysis(slug)
  if (loading) return <LoadingState message="Running analysis..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return null

  const overview = data.overview
  const gaps = data.gap_analysis ?? []
  const redundancies = data.redundancies ?? []

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Ships', value: overview.total_vehicles },
          { label: 'Cargo (SCU)', value: overview.total_cargo.toLocaleString() },
          { label: 'Min Crew', value: overview.min_crew },
          { label: 'Max Crew', value: overview.max_crew },
        ].map(({ label, value }) => (
          <div key={label} className="panel p-3 text-center">
            <p className="text-xl font-mono text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-display tracking-wide uppercase">{label}</p>
          </div>
        ))}
      </div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div>
          <h3 className="text-xs font-display tracking-widest uppercase text-gray-400 mb-2">Fleet Gaps</h3>
          <div className="space-y-1.5">
            {gaps.map((gap) => (
              <div key={gap.role} className="flex items-center gap-3 px-3 py-2 rounded border border-sc-border/50 bg-white/[0.02]">
                <span className={`text-[10px] uppercase font-display tracking-wide px-1.5 py-0.5 rounded border ${
                  gap.priority === 'high' ? 'text-red-400 border-red-400/30 bg-red-400/10' :
                  gap.priority === 'medium' ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' :
                  'text-gray-400 border-sc-border bg-white/5'
                }`}>{gap.priority}</span>
                <span className="text-sm text-gray-300">{gap.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redundancies */}
      {redundancies.length > 0 && (
        <div>
          <h3 className="text-xs font-display tracking-widest uppercase text-gray-400 mb-2">Redundancies</h3>
          <div className="space-y-1.5">
            {redundancies.map((r) => (
              <div key={r.role} className="px-3 py-2 rounded border border-sc-border/50 bg-white/[0.02]">
                <p className="text-xs text-gray-300 font-medium">{r.role}</p>
                <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gaps.length === 0 && redundancies.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">Fleet is well-balanced — no major gaps or redundancies found.</p>
      )}
    </div>
  )
}

// ── About Tab (RSI scraped content) ───────────────────────────────────

function OrgAbout({ org }) {
  const [expandedSection, setExpandedSection] = useState(null)

  const sections = [
    { id: 'history', label: 'History', content: org.rsi_history_html },
    { id: 'manifesto', label: 'Manifesto', content: org.rsi_manifesto_html },
    { id: 'charter', label: 'Charter', content: org.rsi_charter_html },
  ].filter(s => s.content)

  if (sections.length === 0 && !org.rsi_model) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm">No RSI data available</p>
        {org.callerRole === 'owner' && (
          <p className="text-xs mt-1">Sync from RSI in org settings to populate this section</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* RSI badges */}
      {(org.rsi_model || org.rsi_commitment || org.rsi_primary_focus) && (
        <div className="flex flex-wrap gap-2">
          {org.rsi_model && (
            <span className="text-xs px-2 py-1 rounded border border-sc-border bg-white/5 text-gray-300">
              {org.rsi_model}
            </span>
          )}
          {org.rsi_commitment && (
            <span className="text-xs px-2 py-1 rounded border border-sc-border bg-white/5 text-gray-300">
              {org.rsi_commitment}
            </span>
          )}
          {org.rsi_roleplay && (
            <span className="text-xs px-2 py-1 rounded border border-sc-border bg-white/5 text-gray-300">
              {org.rsi_roleplay}
            </span>
          )}
          {org.rsi_primary_focus && (
            <span className="text-xs px-2 py-1 rounded border border-blue-400/30 bg-blue-400/10 text-blue-400">
              {org.rsi_primary_focus}
            </span>
          )}
          {org.rsi_secondary_focus && (
            <span className="text-xs px-2 py-1 rounded border border-gray-500/30 bg-white/5 text-gray-400">
              {org.rsi_secondary_focus}
            </span>
          )}
        </div>
      )}

      {/* RSI member count */}
      {org.rsi_member_count && (
        <p className="text-xs text-gray-500">
          {org.rsi_member_count.toLocaleString()} members on RSI
        </p>
      )}

      {/* Expandable sections */}
      {sections.map(({ id, label, content }) => (
        <div key={id} className="panel overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === id ? null : id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-xs font-display uppercase tracking-wider text-gray-400">{label}</span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSection === id ? 'rotate-180' : ''}`} />
          </button>
          {expandedSection === id && (
            <div
              className="px-4 pb-4 prose prose-invert prose-sm max-w-none text-gray-300"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main OrgProfile Page ──────────────────────────────────────────────

export default function OrgProfile() {
  const { slug } = useParams()
  const { data: session } = useSession()
  const { data: org, loading, error, refetch } = useOrgProfile(slug)
  const { data: status } = useStatus()
  const features = status?.features || {}
  const TABS = ALL_TABS.filter(t => !t.featureFlag || features[t.featureFlag])
  const VALID_TABS = TABS.map(t => t.id)
  const [showCreateOp, setShowCreateOp] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = VALID_TABS.includes(tabParam) ? tabParam : 'fleet'
  const setActiveTab = useCallback((t) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (t === 'fleet') next.delete('tab')
      else next.set('tab', t)
      return next
    }, { replace: true })
  }, [setSearchParams])

  if (loading) return <LoadingState message="Loading organisation..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!org) return null

  const isLoggedIn = !!session?.user
  const callerRole = org.callerRole
  const canManage = callerRole === 'owner' || callerRole === 'admin'
  const hasAboutContent = org.rsi_model || org.rsi_history_html || org.rsi_manifesto_html || org.rsi_charter_html

  // Only show About tab if there's RSI content or user is owner (can sync)
  const visibleTabs = TABS.filter(t => t.id !== 'about' || hasAboutContent || callerRole === 'owner')

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Banner */}
      {org.rsi_banner_url && (
        <div className="relative -mx-4 -mt-4 sm:mx-0 sm:mt-0 sm:rounded-lg overflow-hidden">
          <img
            src={org.rsi_banner_url}
            alt={`${org.name} banner`}
            className="w-full h-32 sm:h-40 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-sc-bg/80 to-transparent" />
        </div>
      )}

      <PageHeader
        title={org.name}
        subtitle={org.slug}
      />

      {/* Org info card */}
      <div className="panel p-5 flex flex-wrap gap-4 items-start">
        {org.logo && (
          <img src={org.logo} alt={org.name} className="w-16 h-16 rounded border border-sc-border object-cover shrink-0" />
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            {org.verified_at && (
              <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 border border-green-400/30 px-1.5 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" />
                Verified
              </span>
            )}
            {org.rsiSid && (
              <a
                href={`${RSI_BASE}/en/orgs/${org.rsiSid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-sc-accent hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                RSI Page
              </a>
            )}
            {org.homepage && (
              <a href={org.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300">
                <Globe className="w-3.5 h-3.5" />
                Website
              </a>
            )}
            {org.discord && (
              <a href={org.discord} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300">
                <MessageSquare className="w-3.5 h-3.5" />
                Discord
              </a>
            )}
            {org.twitch && (
              <a href={org.twitch} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300">
                <Tv className="w-3.5 h-3.5" />
                Twitch
              </a>
            )}
            {org.youtube && (
              <a href={org.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300">
                <Youtube className="w-3.5 h-3.5" />
                YouTube
              </a>
            )}
          </div>

          {org.description && (
            <p className="text-sm text-gray-400 leading-relaxed">{org.description}</p>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" />
            {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'}
            {org.rsi_member_count && org.rsi_member_count !== org.memberCount && (
              <span className="text-gray-600">({org.rsi_member_count.toLocaleString()} on RSI)</span>
            )}
            <span className="text-gray-600">·</span>
            <span>Founded {new Date(org.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {canManage && (
          <Link
            to={`/orgs/${slug}/settings`}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors border border-sc-border rounded px-2.5 py-1.5 shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-sc-border mb-4">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-display tracking-wide uppercase transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-sc-accent text-sc-accent'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'fleet' && <OrgFleet slug={slug} callerRole={callerRole} />}
        {activeTab === 'ops' && (
          showCreateOp
            ? <CreateOp slug={slug} onClose={() => setShowCreateOp(false)} />
            : <OrgOpsList slug={slug} callerRole={callerRole} onCreateOp={() => setShowCreateOp(true)} />
        )}
        {activeTab === 'members' && (
          isLoggedIn
            ? <OrgMembers slug={slug} />
            : (
              <div className="text-center py-16 text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-sm">Sign in to view members</p>
                <Link to="/login" className="btn-primary text-xs mt-3 inline-flex">Sign In</Link>
              </div>
            )
        )}
        {activeTab === 'analysis' && (
          isLoggedIn
            ? <OrgAnalysis slug={slug} />
            : (
              <div className="text-center py-16 text-gray-500">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-sm">Sign in to view fleet analysis</p>
                <Link to="/login" className="btn-primary text-xs mt-3 inline-flex">Sign In</Link>
              </div>
            )
        )}
        {activeTab === 'about' && <OrgAbout org={org} />}
      </div>
    </div>
  )
}
