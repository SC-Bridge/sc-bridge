import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useSession, authClient, signIn, signOut } from '../../lib/auth-client'
import useTimezone from '../../hooks/useTimezone'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'

import ProfileSection from './ProfileSection'
import RsiProfileSection from './RsiProfileSection'
import LinkedAccountsSection from './LinkedAccountsSection'
import PasswordSection from './PasswordSection'
import TwoFactorSection from './TwoFactorSection'
import PasskeySection from './PasskeySection'
import SessionsSection from './SessionsSection'
import DataPrivacySection from './DataPrivacySection'

export default function Account() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: session, isPending } = useSession()
  const { timezone } = useTimezone()
  const user = session?.user

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [error, setError] = useState(null)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState(null)
  const [emailError, setEmailError] = useState(null)
  const [showEmailEdit, setShowEmailEdit] = useState(false)

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

  // 2FA
  const [totpUri, setTotpUri] = useState(null)
  const [backupCodes, setBackupCodes] = useState(null)
  const [totpCode, setTotpCode] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [twoFAError, setTwoFAError] = useState(null)
  const [twoFAMsg, setTwoFAMsg] = useState(null)
  const [twoFAPassword, setTwoFAPassword] = useState('')
  const [showEnablePrompt, setShowEnablePrompt] = useState(false)
  const [showDisablePrompt, setShowDisablePrompt] = useState(false)

  // Passkeys
  const [passkeys, setPasskeys] = useState([])
  const [passkeysLoading, setPasskeysLoading] = useState(true)
  const [passkeyError, setPasskeyError] = useState(null)
  const [passkeyMsg, setPasskeyMsg] = useState(null)
  const [showPasskeyNamePrompt, setShowPasskeyNamePrompt] = useState(false)
  const [passkeyNameInput, setPasskeyNameInput] = useState('')
  const [editingPasskeyId, setEditingPasskeyId] = useState(null)
  const [editingPasskeyName, setEditingPasskeyName] = useState('')

  // Account providers (OAuth vs password)
  const [hasPassword, setHasPassword] = useState(null) // null = loading, true/false = known
  const [providers, setProviders] = useState([])
  const [availableProviders, setAvailableProviders] = useState([])
  const [unlinkConfirm, setUnlinkConfirm] = useState(null) // providerId being confirmed
  const [unlinking, setUnlinking] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [initPw, setInitPw] = useState('')
  const [initPwConfirm, setInitPwConfirm] = useState('')
  const [initPwSaving, setInitPwSaving] = useState(false)
  const [initPwMsg, setInitPwMsg] = useState(null)
  const [initPwError, setInitPwError] = useState(null)

  // RSI Profile
  const [rsiProfile, setRsiProfile] = useState(null)
  const [rsiExtensionProfile, setRsiExtensionProfile] = useState(null)
  const [rsiVerification, setRsiVerification] = useState(null)
  const [rsiLoading, setRsiLoading] = useState(true)
  const [rsiHandle, setRsiHandle] = useState('')
  const [rsiSyncing, setRsiSyncing] = useState(false)
  const [rsiError, setRsiError] = useState(null)
  const [rsiMsg, setRsiMsg] = useState(null)

  // Avatar
  const [avatarInfo, setAvatarInfo] = useState(null)
  const [avatarMsg, setAvatarMsg] = useState(null)
  const [avatarError, setAvatarError] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [showAvatarChoice, setShowAvatarChoice] = useState(null) // { gravatarUrl }
  const avatarFileRef = useRef(null)

  // Data & Privacy
  const [exporting, setExporting] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [dataMsg, setDataMsg] = useState(null)
  const [dataError, setDataError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user) setName(user.name || '')
  }, [user])

  useEffect(() => {
    if (searchParams.get('emailChanged') === 'true') {
      setEmailMsg('Your email address has been updated successfully')
      setSearchParams({}, { replace: true })
      setTimeout(() => setEmailMsg(null), 8000)
    }
  }, [searchParams, setSearchParams])

  // ── Fetch callbacks ───────────────────────────────────────────────────────

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

  const fetchPasskeys = useCallback(async () => {
    setPasskeysLoading(true)
    try {
      const result = await authClient.passkey.listUserPasskeys()
      setPasskeys(result.data || [])
    } catch {
      // Passkey listing may not be available
    } finally {
      setPasskeysLoading(false)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const resp = await fetch('/api/account/providers', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setHasPassword(data.hasPassword)
        setProviders(data.providers)
        setAvailableProviders(data.availableProviders || [])
      }
    } catch {
      // Default to showing password section if check fails
      setHasPassword(true)
    }
  }, [])

  const fetchRsiProfile = useCallback(async () => {
    setRsiLoading(true)
    try {
      const resp = await fetch('/api/account/rsi-profile', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setRsiProfile(data.profile)
        setRsiExtensionProfile(data.extensionProfile)
        setRsiVerification(data.verification)
        if (data.profile?.handle) setRsiHandle(data.profile.handle)
        else if (data.extensionProfile?.rsi_handle) setRsiHandle(data.extensionProfile.rsi_handle)
      }
    } catch {
      // Non-critical
    } finally {
      setRsiLoading(false)
    }
  }, [])

  const fetchAvatarInfo = useCallback(async () => {
    try {
      const resp = await fetch('/api/account/avatar-info', { credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        setAvatarInfo(data)
      }
    } catch {
      // Non-critical
    }
  }, [])

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleRsiSync = async (e) => {
    e.preventDefault()
    if (!rsiHandle.trim()) return
    setRsiSyncing(true)
    setRsiError(null)
    setRsiMsg(null)
    try {
      const resp = await fetch('/api/account/rsi-sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: rsiHandle.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setRsiError(data.error || 'Sync failed')
      } else {
        setRsiProfile(data.profile)
        setRsiMsg('RSI profile synced')
        setTimeout(() => setRsiMsg(null), 4000)
        if (data.avatarAutoSet) {
          setAvatarInfo(prev => ({ ...prev, userImage: data.avatarAutoSet, rsiAvatarUrl: data.avatarAutoSet }))
          await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
        } else if (data.gravatarUrl) {
          setShowAvatarChoice({ gravatarUrl: data.gravatarUrl })
        }
      }
    } catch (err) {
      setRsiError(err.message || 'Sync failed')
    } finally {
      setRsiSyncing(false)
    }
  }

  const handleSetAvatarSource = async (source) => {
    setAvatarError(null)
    setAvatarMsg(null)
    try {
      const resp = await fetch('/api/account/avatar', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setAvatarError(data.error || 'Failed to set avatar')
      } else {
        setAvatarInfo(prev => ({ ...prev, userImage: data.image }))
        setAvatarMsg(source === 'gravatar' ? 'Gravatar set as avatar' : 'RSI avatar applied')
        setShowAvatarChoice(null)
        setTimeout(() => setAvatarMsg(null), 4000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Failed to set avatar')
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarError(null)
    setAvatarMsg(null)
    try {
      const resp = await fetch('/api/account/avatar', { method: 'DELETE', credentials: 'include' })
      if (resp.ok) {
        setAvatarInfo(prev => ({ ...prev, userImage: null }))
        setAvatarMsg('Avatar removed')
        setTimeout(() => setAvatarMsg(null), 3000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Failed to remove avatar')
    }
  }

  const handleGravatarOptOut = async (optOut) => {
    try {
      const resp = await fetch('/api/account/gravatar-opt-out', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optOut }),
      })
      if (resp.ok) {
        setAvatarInfo(prev => ({ ...prev, gravatarOptedOut: optOut, gravatarUrl: optOut ? null : prev.gravatarUrl }))
        if (!optOut) fetchAvatarInfo()
      }
    } catch {
      // Non-critical
    }
  }

  const resizeAvatar = (file) => new Promise((resolve, reject) => {
    const MAX = 512
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Resize failed')),
        'image/webp',
        0.85,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setAvatarError(null)
    setAvatarMsg(null)
    let blob
    try {
      blob = await resizeAvatar(file)
    } catch (err) {
      setAvatarError(err.message || 'Could not process image')
      setAvatarUploading(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ''
      return
    }
    const formData = new FormData()
    formData.append('avatar', blob, 'avatar.webp')
    try {
      const resp = await fetch('/api/account/avatar/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) {
        setAvatarError(data.error || 'Upload failed')
      } else {
        setAvatarInfo(prev => ({ ...prev, userImage: data.image }))
        setAvatarMsg('Avatar uploaded')
        setTimeout(() => setAvatarMsg(null), 4000)
        await authClient.getSession({ fetchOptions: { cache: 'no-store' } })
      }
    } catch (err) {
      setAvatarError(err.message || 'Upload failed')
    } finally {
      setAvatarUploading(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ''
    }
  }

  useEffect(() => { fetchProviders() }, [fetchProviders])
  useEffect(() => { fetchSessions() }, [fetchSessions])
  useEffect(() => { fetchPasskeys() }, [fetchPasskeys])
  useEffect(() => { fetchRsiProfile() }, [fetchRsiProfile])
  useEffect(() => { fetchAvatarInfo() }, [fetchAvatarInfo])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    setEmailError(null)
    setEmailMsg(null)
    try {
      await authClient.updateUser({ name })

      if (showEmailEdit && newEmail && newEmail !== user.email) {
        const pendingEmail = newEmail
        const result = await authClient.changeEmail({ newEmail, callbackURL: '/account?emailChanged=true' })
        if (result.error) {
          setEmailError(result.error.message || 'Failed to change email')
        } else {
          setEmailMsg(`Verification email sent to ${pendingEmail} \u2014 click the link there to confirm the change`)
          setShowEmailEdit(false)
          setNewEmail('')
          setTimeout(() => setEmailMsg(null), 10000)
        }
      }

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
    if (!/[a-zA-Z]/.test(newPassword)) {
      setPasswordError('Password must contain at least one letter')
      return
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordError('Password must contain at least one number')
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

  const handleSetPassword = async (e) => {
    e.preventDefault()
    setInitPwError(null)
    setInitPwMsg(null)

    if (initPw !== initPwConfirm) {
      setInitPwError('Passwords do not match')
      return
    }
    if (initPw.length < 8) {
      setInitPwError('Password must be at least 8 characters')
      return
    }
    if (!/[a-zA-Z]/.test(initPw)) {
      setInitPwError('Password must contain at least one letter')
      return
    }
    if (!/[0-9]/.test(initPw)) {
      setInitPwError('Password must contain at least one number')
      return
    }

    setInitPwSaving(true)
    try {
      const resp = await fetch('/api/account/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword: initPw }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setInitPwError(data.message || data.error || 'Failed to set password')
      } else {
        setInitPwMsg('Password set successfully')
        setInitPw('')
        setInitPwConfirm('')
        setHasPassword(true)
        setTimeout(() => setInitPwMsg(null), 3000)
      }
    } catch (err) {
      setInitPwError(err.message || 'Failed to set password')
    } finally {
      setInitPwSaving(false)
    }
  }

  const handleUnlinkProvider = async (providerId) => {
    setUnlinking(true)
    setLinkError(null)
    try {
      const resp = await fetch('/api/account/unlink-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setLinkError(data.error || 'Failed to unlink provider')
      } else {
        setUnlinkConfirm(null)
        await fetchProviders()
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to unlink provider')
    } finally {
      setUnlinking(false)
    }
  }

  const handleLinkProvider = async (providerId) => {
    setLinkError(null)
    try {
      await signIn.social({ provider: providerId, callbackURL: '/account' })
    } catch (err) {
      setLinkError(err.message || 'Failed to link provider')
    }
  }

  const handleEnable2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      const result = await authClient.twoFactor.enable({ password: twoFAPassword })
      if (result.data?.totpURI) {
        setTotpUri(result.data.totpURI)
        setBackupCodes(result.data.backupCodes || null)
        setShowEnablePrompt(false)
        setTwoFAPassword('')
      } else if (result.error) {
        setTwoFAError(result.error.message || 'Failed to enable 2FA')
      }
    } catch (err) {
      setTwoFAError(err.message || 'Failed to enable 2FA')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleVerify2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode })
      if (result.error) {
        setTwoFAError(result.error.message || 'Invalid code')
      } else {
        setTwoFAMsg('Two-factor authentication enabled')
        setTotpUri(null)
        setTotpCode('')
        setTimeout(() => setTwoFAMsg(null), 3000)
      }
    } catch (err) {
      setTwoFAError(err.message || 'Verification failed')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleDisable2FA = async () => {
    setTwoFALoading(true)
    setTwoFAError(null)
    try {
      await authClient.twoFactor.disable({ password: twoFAPassword })
      setTwoFAMsg('Two-factor authentication disabled')
      setShowDisablePrompt(false)
      setTwoFAPassword('')
      setTimeout(() => setTwoFAMsg(null), 3000)
    } catch (err) {
      setTwoFAError(err.message || 'Failed to disable 2FA')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleAddPasskey = async () => {
    setPasskeyError(null)
    try {
      const opts = passkeyNameInput.trim() ? { name: passkeyNameInput.trim() } : {}
      await authClient.passkey.addPasskey(opts)
      await fetchPasskeys()
      setShowPasskeyNamePrompt(false)
      setPasskeyNameInput('')
      setPasskeyMsg('Passkey added successfully')
      setTimeout(() => setPasskeyMsg(null), 5000)
    } catch (err) {
      setPasskeyError(err.message || 'Failed to add passkey')
    }
  }

  const handleUpdatePasskey = async (id) => {
    setPasskeyError(null)
    try {
      await authClient.passkey.updatePasskey({ id, name: editingPasskeyName.trim() })
      await fetchPasskeys()
      setEditingPasskeyId(null)
      setEditingPasskeyName('')
    } catch (err) {
      setPasskeyError(err.message || 'Failed to rename passkey')
    }
  }

  // TODO: Replace window.confirm with ConfirmDialog for consistent UX
  const handleDeletePasskey = async (passkeyId) => {
    if (!window.confirm('Remove this passkey?')) return
    setPasskeyError(null)
    try {
      await authClient.passkey.deletePasskey({ id: passkeyId })
      await fetchPasskeys()
    } catch (err) {
      setPasskeyError(err.message || 'Failed to remove passkey')
    }
  }

  const handleRevokeSession = async (sessionToken) => {
    const isCurrent = sessionToken === session?.session?.token
    if (isCurrent && !window.confirm('This will sign you out. Continue?')) return
    try {
      await authClient.revokeSession({ token: sessionToken })
      if (isCurrent) {
        await signOut()
        navigate('/login', { replace: true })
        return
      }
      await fetchSessions()
    } catch {
      // Silently fail
    }
  }

  const handleRevokeAllSessions = async () => {
    if (!window.confirm('This will sign you out of all devices, including this one. Continue?')) return
    try {
      await authClient.revokeSessions()
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      // Silently fail
    }
  }

  const handleExportDownload = async () => {
    setExporting(true)
    setDataError(null)
    try {
      const resp = await fetch('/api/account/export', { credentials: 'include' })
      if (!resp.ok) throw new Error('Export failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resp.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'scbridge-data-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDataError(err.message || 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  const handleExportEmail = async () => {
    setEmailing(true)
    setDataError(null)
    setDataMsg(null)
    try {
      const resp = await fetch('/api/account/export-email', { method: 'POST', credentials: 'include' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to email export')
      setDataMsg(data.message)
      setTimeout(() => setDataMsg(null), 5000)
    } catch (err) {
      setDataError(err.message || 'Failed to email export')
    } finally {
      setEmailing(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    setDataError(null)
    try {
      const resp = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let message = 'Failed to delete account'
        try { message = JSON.parse(text).error || message } catch {}
        throw new Error(message)
      }
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      setDataError(err.message || 'Failed to delete account')
      setDeleting(false)
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

      {/* Section jump links */}
      <nav className="sticky top-0 z-10 bg-sc-dark/90 backdrop-blur-sm -mx-6 px-6 py-2 border-b border-sc-border flex flex-wrap gap-1.5">
        {[
          { id: 'profile', label: 'Profile' },
          { id: 'rsi', label: 'RSI Profile' },
          { id: 'linked', label: 'Linked Accounts' },
          { id: 'password', label: 'Password' },
          { id: '2fa', label: '2FA' },
          { id: 'passkeys', label: 'Passkeys' },
          { id: 'sessions', label: 'Sessions' },
          { id: 'data', label: 'Data & Privacy' },
        ].map(({ id, label }) => (
          <a
            key={id}
            href={`#section-${id}`}
            className="px-2.5 py-1 rounded text-[10px] font-display uppercase tracking-wide text-gray-400 hover:text-sc-accent hover:bg-sc-accent/10 border border-sc-border hover:border-sc-accent/30 transition-colors"
          >
            {label}
          </a>
        ))}
      </nav>

      <ProfileSection
        user={user}
        name={name} setName={setName}
        saving={saving} saveMsg={saveMsg} error={error}
        newEmail={newEmail} setNewEmail={setNewEmail}
        emailMsg={emailMsg} emailError={emailError}
        showEmailEdit={showEmailEdit} setShowEmailEdit={setShowEmailEdit} setEmailError={setEmailError}
        avatarInfo={avatarInfo} avatarMsg={avatarMsg} avatarError={avatarError}
        avatarUploading={avatarUploading}
        showAvatarChoice={showAvatarChoice} setShowAvatarChoice={setShowAvatarChoice}
        onUpdateProfile={handleUpdateProfile}
        onRemoveAvatar={handleRemoveAvatar}
        onSetAvatarSource={handleSetAvatarSource}
        onGravatarOptOut={handleGravatarOptOut}
        onAvatarUpload={handleAvatarUpload}
        avatarFileRef={avatarFileRef}
      />

      <RsiProfileSection
        timezone={timezone}
        rsiProfile={rsiProfile} extensionProfile={rsiExtensionProfile}
        verification={rsiVerification}
        rsiLoading={rsiLoading}
        rsiHandle={rsiHandle} setRsiHandle={setRsiHandle}
        rsiSyncing={rsiSyncing} rsiError={rsiError} rsiMsg={rsiMsg}
        onRsiSync={handleRsiSync}
        onRefresh={fetchRsiProfile}
      />

      <LinkedAccountsSection
        providers={providers}
        availableProviders={availableProviders}
        linkError={linkError}
        unlinkConfirm={unlinkConfirm} setUnlinkConfirm={setUnlinkConfirm}
        unlinking={unlinking}
        onUnlinkProvider={handleUnlinkProvider}
        onLinkProvider={handleLinkProvider}
      />

      <PasswordSection
        hasPassword={hasPassword}
        providers={providers}
        currentPassword={currentPassword} setCurrentPassword={setCurrentPassword}
        newPassword={newPassword} setNewPassword={setNewPassword}
        confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
        passwordSaving={passwordSaving} passwordMsg={passwordMsg} passwordError={passwordError}
        onChangePassword={handleChangePassword}
        initPw={initPw} setInitPw={setInitPw}
        initPwConfirm={initPwConfirm} setInitPwConfirm={setInitPwConfirm}
        initPwSaving={initPwSaving} initPwMsg={initPwMsg} initPwError={initPwError}
        onSetPassword={handleSetPassword}
      />

      <TwoFactorSection
        user={user}
        hasPassword={hasPassword}
        totpUri={totpUri} setTotpUri={setTotpUri}
        backupCodes={backupCodes} setBackupCodes={setBackupCodes}
        totpCode={totpCode} setTotpCode={setTotpCode}
        twoFALoading={twoFALoading} twoFAError={twoFAError} twoFAMsg={twoFAMsg} setTwoFAMsg={setTwoFAMsg}
        twoFAPassword={twoFAPassword} setTwoFAPassword={setTwoFAPassword}
        showEnablePrompt={showEnablePrompt} setShowEnablePrompt={setShowEnablePrompt}
        showDisablePrompt={showDisablePrompt} setShowDisablePrompt={setShowDisablePrompt}
        setTwoFAError={setTwoFAError}
        onEnable2FA={handleEnable2FA}
        onVerify2FA={handleVerify2FA}
        onDisable2FA={handleDisable2FA}
      />

      <PasskeySection
        timezone={timezone}
        passkeys={passkeys} passkeysLoading={passkeysLoading}
        passkeyError={passkeyError} passkeyMsg={passkeyMsg}
        showPasskeyNamePrompt={showPasskeyNamePrompt} setShowPasskeyNamePrompt={setShowPasskeyNamePrompt}
        passkeyNameInput={passkeyNameInput} setPasskeyNameInput={setPasskeyNameInput}
        editingPasskeyId={editingPasskeyId} setEditingPasskeyId={setEditingPasskeyId}
        editingPasskeyName={editingPasskeyName} setEditingPasskeyName={setEditingPasskeyName}
        onAddPasskey={handleAddPasskey}
        onUpdatePasskey={handleUpdatePasskey}
        onDeletePasskey={handleDeletePasskey}
      />

      <SessionsSection
        timezone={timezone}
        session={session}
        sessions={sessions} sessionsLoading={sessionsLoading}
        onRevokeSession={handleRevokeSession}
        onRevokeAllSessions={handleRevokeAllSessions}
      />

      <DataPrivacySection
        exporting={exporting} emailing={emailing}
        dataMsg={dataMsg} dataError={dataError}
        showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
        deleteConfirmText={deleteConfirmText} setDeleteConfirmText={setDeleteConfirmText}
        deleting={deleting}
        onExportDownload={handleExportDownload}
        onExportEmail={handleExportEmail}
        onDeleteAccount={handleDeleteAccount}
      />
    </div>
  )
}
