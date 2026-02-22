import React, { useState, useEffect, useCallback } from 'react'
import { User, Mail, Lock, Shield, Link2, Monitor, AlertCircle, Check } from 'lucide-react'
import { useSession, authClient } from '../lib/auth-client'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import PanelSection from '../components/PanelSection'

export default function Account() {
  const { data: session, isPending } = useSession()
  const user = session?.user

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [error, setError] = useState(null)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [passwordError, setPasswordError] = useState(null)

  // Sessions
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    if (user) setName(user.name || '')
  }, [user])

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const result = await authClient.listSessions()
      setSessions(result.data || [])
    } catch {
      // Sessions listing may not be available
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    try {
      await authClient.updateUser({ name })
      setSaveMsg('Profile updated')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordMsg(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordSaving(true)
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
      })
      setPasswordMsg('Password changed')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordMsg(null), 3000)
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleRevokeSession = async (sessionToken) => {
    try {
      await authClient.revokeSession({ token: sessionToken })
      await fetchSessions()
    } catch {
      // Silently fail
    }
  }

  if (isPending) return <LoadingState variant="skeleton" />
  if (!user) return null

  const roleBadgeColor = {
    super_admin: 'text-sc-danger bg-sc-danger/10 border-sc-danger/30',
    admin: 'text-sc-warn bg-sc-warn/10 border-sc-warn/30',
    user: 'text-gray-400 bg-white/5 border-sc-border',
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="ACCOUNT"
        subtitle={user.email}
        actions={
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-mono uppercase tracking-wider ${roleBadgeColor[user.role] || roleBadgeColor.user}`}>
            <Shield className="w-3 h-3" />
            {user.role || 'user'}
          </span>
        }
      />

      {/* Profile */}
      <PanelSection title="Profile" icon={User}>
        <form onSubmit={handleUpdateProfile} className="p-5 space-y-4 max-w-md">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {saveMsg && (
            <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{saveMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="account-name" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Display Name
            </label>
            <input
              id="account-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-sc-darker/50 border border-sc-border rounded text-sm text-gray-500">
              <Mail className="w-4 h-4" />
              {user.email}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-6 py-2 font-display tracking-wider uppercase text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </PanelSection>

      {/* Change Password */}
      <PanelSection title="Change Password" icon={Lock}>
        <form onSubmit={handleChangePassword} className="p-5 space-y-4 max-w-md">
          {passwordError && (
            <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}
          {passwordMsg && (
            <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>{passwordMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="current-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Current Password
            </label>
            <input
              id="current-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
            />
          </div>

          <div>
            <label htmlFor="new-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              New Password
            </label>
            <input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirm-pw" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Confirm New Password
            </label>
            <input
              id="confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={passwordSaving}
            className="btn-primary px-6 py-2 font-display tracking-wider uppercase text-sm disabled:opacity-50"
          >
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </PanelSection>

      {/* Active Sessions */}
      <PanelSection title="Active Sessions" icon={Monitor}>
        <div className="p-5">
          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => {
                const isCurrent = s.token === session?.session?.token
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-sc-darker border border-sc-border rounded"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">
                          {isCurrent ? 'Current Session' : 'Session'}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-mono text-sc-accent bg-sc-accent/10 px-1.5 py-0.5 rounded">
                            THIS DEVICE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-1">
                        Expires: {new Date(s.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.token)}
                        className="text-xs text-sc-danger hover:text-sc-danger/80 transition-colors font-mono uppercase tracking-wider"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </PanelSection>
    </div>
  )
}
