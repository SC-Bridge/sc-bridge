import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus, ExternalLink, Users, ChevronRight } from 'lucide-react'
import { useUserOrgs } from '../hooks/useAPI'
import { authClient } from '../lib/auth-client'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const RSI_BASE = 'https://robertsspaceindustries.com'

const ROLE_BADGE = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  admin: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  member: 'text-gray-400 bg-white/5 border-sc-border',
}

export default function Orgs() {
  const { data, loading, error, refetch } = useUserOrgs()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [createError, setCreateError] = useState('')

  const orgs = data?.orgs ?? []

  const handleNameChange = (e) => {
    const val = e.target.value
    setName(val)
    // Auto-generate slug from name
    setSlug(val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const result = await authClient.organization.create({ name: name.trim(), slug: slug.trim() })
      if (result.error) {
        setCreateError(result.error.message || 'Failed to create organisation')
        return
      }
      setShowCreate(false)
      setName('')
      setSlug('')
      await refetch()
      navigate(`/orgs/${slug.trim()}`)
    } catch (err) {
      setCreateError(err.message || 'Failed to create organisation')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <LoadingState message="Loading organisations..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="MY ORGANISATIONS"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Org
          </button>
        }
      />

      {/* Create org form */}
      {showCreate && (
        <div className="panel p-6 space-y-4">
          <h2 className="font-display tracking-wide text-sm text-white uppercase">Create Organisation</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="My Organisation"
                className="input w-full max-w-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL slug</label>
              <div className="flex items-center gap-2 max-w-sm">
                <span className="text-xs text-gray-500 font-mono">/orgs/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))}
                  placeholder="my-org"
                  className="input flex-1 font-mono"
                  required
                  pattern="[a-z0-9][a-z0-9-]*"
                  title="Lowercase letters, numbers, and hyphens only"
                />
              </div>
            </div>
            {createError && (
              <p className="text-red-400 text-xs">{createError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={creating || !name || !slug} className="btn-primary text-xs">
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setCreateError('') }} className="btn-secondary text-xs">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Org list */}
      {orgs.length === 0 ? (
        <div className="panel p-12 flex flex-col items-center gap-4 text-center">
          <Building2 className="w-12 h-12 text-gray-600" />
          <div>
            <p className="text-gray-400 font-display tracking-wide">No organisations yet</p>
            <p className="text-xs text-gray-500 mt-1">Create one or wait for an invitation</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />
            Create Organisation
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {orgs.map((org) => (
            <Link
              key={org.id}
              to={`/orgs/${org.slug}`}
              className="panel p-4 flex items-center gap-4 hover:border-sc-accent/40 transition-colors group"
            >
              {org.logo ? (
                <img src={org.logo} alt={org.name} className="w-10 h-10 rounded border border-sc-border object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded border border-sc-border bg-sc-darker flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display tracking-wide text-white group-hover:text-sc-accent transition-colors">{org.name}</span>
                  <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border font-display ${ROLE_BADGE[org.role] || ROLE_BADGE.member}`}>
                    {org.role}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {org.memberCount ?? '?'} members
                  </span>
                  {org.rsiSid && (
                    <a
                      href={`${RSI_BASE}/en/orgs/${org.rsiSid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-sc-accent flex items-center gap-1 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      RSI
                    </a>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-sc-accent transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
