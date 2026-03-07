import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useOrgProfile } from '../hooks/useAPI'
import { updateOrgSettings } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'

const FIELDS = [
  { key: 'rsiSid', label: 'RSI Org SID', placeholder: 'MYORG', maxLength: 20 },
  { key: 'description', label: 'Description', placeholder: 'A brief description of your org', maxLength: 500, multiline: true },
  { key: 'rsiUrl', label: 'RSI Profile URL', placeholder: 'https://robertsspaceindustries.com/en/orgs/MYORG', type: 'url' },
  { key: 'homepage', label: 'Website', placeholder: 'https://myorg.example.com', type: 'url' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/invite-code', type: 'url' },
  { key: 'twitch', label: 'Twitch', placeholder: 'https://twitch.tv/channel', type: 'url' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@channel', type: 'url' },
]

export default function OrgSettings() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: org, loading, error, refetch } = useOrgProfile(slug)

  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (org) {
      const initial = {}
      for (const { key } of FIELDS) {
        initial[key] = org[key] ?? ''
      }
      setForm(initial)
    }
  }, [org])

  if (loading) return <LoadingState message="Loading org settings..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!org) return null

  if (org.callerRole !== 'owner' && org.callerRole !== 'admin') {
    return (
      <div className="text-center py-16 text-gray-500 space-y-3">
        <p className="text-sm">You need to be an org owner or admin to access settings.</p>
        <Link to={`/orgs/${slug}`} className="btn-primary text-xs inline-flex">Back to Org</Link>
      </div>
    )
  }

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaved(false)
    setSaveError(null)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)

    try {
      const payload = {}
      for (const { key } of FIELDS) {
        const val = form[key]?.trim() || null
        payload[key] = val
      }
      await updateOrgSettings(slug, payload)
      setSaved(true)
      refetch()
    } catch (err) {
      setSaveError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-2xl">
      <PageHeader title="Org Settings" subtitle={org.name} />

      <Link
        to={`/orgs/${slug}`}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to profile
      </Link>

      <form onSubmit={handleSave} className="panel p-5 space-y-5">
        {FIELDS.map(({ key, label, placeholder, maxLength, type, multiline }) => (
          <div key={key}>
            <label className="block text-xs font-display uppercase tracking-wider text-gray-400 mb-1.5">
              {label}
            </label>
            {multiline ? (
              <textarea
                value={form[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
                rows={3}
                className="w-full bg-sc-darker border border-sc-border rounded px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-sc-accent focus:outline-none resize-none"
              />
            ) : (
              <input
                type={type || 'text'}
                value={form[key] ?? ''}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                maxLength={maxLength || 200}
                className="w-full bg-sc-darker border border-sc-border rounded px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-sc-accent focus:outline-none"
              />
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {saved && (
            <span className="text-xs text-green-400">Settings saved</span>
          )}
          {saveError && (
            <span className="text-xs text-red-400">{saveError}</span>
          )}
        </div>
      </form>
    </div>
  )
}
